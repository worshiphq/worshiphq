import "server-only";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";
import { timeReached, localParts, mmddInTz, ymdInTz } from "@/lib/time/tz";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import type { Channel, Automation } from "@prisma/client";

function todayMMDD(now = new Date()): string {
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface AutomationOutcome {
  churchId: string;
  automation: string;
  trigger: string;
  sent: number;
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  birthday:
    "Happy birthday, {name}! 🎉 The whole family at {church} is celebrating you today. May God bless your new year. - {church}",
  anniversary:
    "Happy anniversary, {name}! {church} celebrates God's faithfulness in your union. May your love keep growing. 💍",
  visitor_followup:
    "Hi {name}, it was a joy to have you at {church}! We'd love to see you again. Have an amazing week. God bless you.",
  lapsed:
    "Hi {name}, we've missed you at {church}. You're always welcome - we'd love to reconnect. Is there any way we can support you? 🙏",
  new_member:
    "Welcome to {church}, {name}! We're so glad you've joined the family. God bless you richly! 🙌",
  giving_thanks:
    "Thank you for your generous giving, {name}. Your support helps {church} carry out its mission. God bless you! 🙏",
};

export const TRIGGER_CATALOG: Record<string, { name: string; description: string }> = {
  birthday: { name: "Birthday blessings", description: "Wishes a member happy birthday on the day." },
  anniversary: { name: "Anniversary wishes", description: "Celebrates a member's anniversary on the day." },
  visitor_followup: { name: "First-time visitor follow-up", description: "Welcomes new visitors a few days after they register - you choose how many days and, optionally, what time." },
  lapsed: { name: "We miss you", description: "Gently checks in on members who've gone inactive." },
  new_member: { name: "New member welcome", description: "Welcomes newly registered members to the church." },
  giving_thanks: { name: "Giving thank you", description: "Thanks members who have given recently." },
};

function renderTemplate(template: string, firstName: string, churchName: string): string {
  return template
    .replace(/\{name\}/g, firstName)
    .replace(/\{church\}/g, churchName);
}

/** Flip each trigger's dedupe guard for targets that were actually texted
 *  successfully, so the automation never repeats itself for the same
 *  visitor/person/gift on a later run. */
async function markSent(trigger: string, sentTargets: Target[], now: Date) {
  const visitorIds = sentTargets.filter((t) => t.visitorId).map((t) => t.visitorId!);
  if (visitorIds.length > 0) {
    await db.visitor.updateMany({ where: { id: { in: visitorIds } }, data: { welcomeSmsSentAt: now } });
  }
  if (trigger === "new_member" || trigger === "lapsed") {
    const personIds = sentTargets.filter((t) => t.personId).map((t) => t.personId!);
    if (personIds.length > 0) {
      await db.person.updateMany({
        where: { id: { in: personIds } },
        data: trigger === "new_member" ? { newMemberWelcomeSentAt: now } : { lapsedSmsSentAt: now },
      });
    }
  }
  if (trigger === "giving_thanks") {
    const giftIds = sentTargets.flatMap((t) => t.giftIds ?? []);
    if (giftIds.length > 0) {
      await db.gift.updateMany({ where: { id: { in: giftIds } }, data: { thanksSentAt: now } });
    }
  }
}

/**
 * `quietHours`: used by the hourly pass so soft messages (welcome, we-miss-you,
 * thank-you, anniversary) only go out between 8am and 8pm church-local time
 * instead of whenever the cron happens to tick. Visitor follow-ups keep their
 * own send hour. `deadline` stops starting new churches (the next tick resumes).
 */
export async function runAutomations(now = new Date(), opts: { only?: string[]; deadline?: Deadline; quietHours?: boolean } = {}): Promise<{
  ran: number;
  totalSent: number;
  outcomes: AutomationOutcome[];
}> {
  const churches = await db.church.findMany({
    where: { isDemo: false },
    select: { id: true, name: true, timezone: true },
  });

  const outcomes: AutomationOutcome[] = [];
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  await forEachChurch(churches, async (church) => {
    const automations = await db.automation.findMany({
      where: { churchId: church.id, active: true },
    });
    if (automations.length === 0) return;

    const localHour = localParts(now, church.timezone).hour;
    const nightTime = opts.quietHours && (localHour < 8 || localHour >= 20);
    const mmdd = mmddInTz(now, church.timezone, 0);
    const todayYmd = ymdInTz(now, church.timezone);

    for (const a of automations) {
      // Birthdays are handled by the built-in, timezone-aware runBirthdays now.
      if (a.trigger === "birthday") continue;
      if (opts.only && !opts.only.includes(a.trigger)) continue;
      // Hourly pass: no soft texts at night (visitor follow-up has its own hour).
      if (nightTime && a.trigger !== "visitor_followup") continue;
      // Anniversary has no per-person "already sent" flag, so once a day per church.
      if (a.trigger === "anniversary" && a.lastRunAt && ymdInTz(a.lastRunAt, church.timezone) === todayYmd) continue;
      // Visitor follow-up can be pinned to a local send hour per church -
      // skip this tick entirely until the church's clock reaches it.
      if (a.trigger === "visitor_followup" && a.sendHour != null && !timeReached(now, church.timezone, a.sendHour, 0)) continue;
      const targets = await targetsFor(church.id, a.trigger, mmdd, threeDaysAgo, sevenDaysAgo, now, a);
      if (targets.length === 0) continue;

      const template = a.messageTemplate || DEFAULT_TEMPLATES[a.trigger] || "A message from {church}.";

      let sent = 0;
      const sentTargets: Target[] = [];
      for (const t of targets) {
        if (!t.phone) continue;
        const message = renderTemplate(template, t.firstName, church.name);
        const res = await sendChurchSms(church.id, t.phone, message, { note: `${a.name} (automated)` });
        if (res.insufficient) break;
        if (res.ok) {
          sent++;
          sentTargets.push(t);
        }
      }
      // Dedupe guard, per trigger (visitor/new-member/lapsed/gift) - this is
      // what stops each of these from re-firing on every hourly run for the
      // whole window it's eligible in.
      await markSent(a.trigger, sentTargets, now);

      if (sent > 0) {
        await db.automation.update({
          where: { id: a.id },
          data: { runs: { increment: sent }, lastRunAt: now },
        });
        await db.communication.create({
          data: {
            churchId: church.id,
            name: `${a.name} (automated)`,
            channel: a.channel as Channel,
            body: renderTemplate(template, "{name}", church.name),
            segment: a.trigger,
            sent,
            delivered: sent,
            status: "sent",
          },
        });
      }

      outcomes.push({ churchId: church.id, automation: a.name, trigger: a.trigger, sent });
    }
  }, { deadline: opts.deadline, label: "automations" });

  const totalSent = outcomes.reduce((s, o) => s + o.sent, 0);
  return { ran: outcomes.length, totalSent, outcomes };
}

export async function runSingleAutomation(automationId: string, churchId: string): Promise<{ ok: boolean; sent: number; error?: string }> {
  const automation = await db.automation.findFirst({
    where: { id: automationId, churchId },
  });
  if (!automation) return { ok: false, sent: 0, error: "Automation not found." };

  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!church) return { ok: false, sent: 0, error: "Church not found." };

  const now = new Date();
  const mmdd = todayMMDD(now);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  // "Run now" is an explicit manual trigger - it ignores sendHour (that's
  // only a gate for the automatic cron) but still respects delayDays, since
  // that's about the visitor being ready, not about the time of day.
  const targets = await targetsFor(churchId, automation.trigger, mmdd, threeDaysAgo, sevenDaysAgo, now, automation);
  if (targets.length === 0) return { ok: true, sent: 0, error: "No matching members found for this trigger right now." };

  const template = automation.messageTemplate || DEFAULT_TEMPLATES[automation.trigger] || "A message from {church}.";

  let sent = 0;
  const sentTargets: Target[] = [];
  for (const t of targets) {
    if (!t.phone) continue;
    const message = renderTemplate(template, t.firstName, church.name);
    const res = await sendChurchSms(churchId, t.phone, message, { note: `${automation.name} (manual run)` });
    if (res.insufficient) return { ok: false, sent, error: "Insufficient SMS credits." };
    if (res.ok) {
      sent++;
      sentTargets.push(t);
    }
  }
  await markSent(automation.trigger, sentTargets, now);

  if (sent > 0) {
    await db.automation.update({
      where: { id: automationId },
      data: { runs: { increment: sent }, lastRunAt: now },
    });
    await db.communication.create({
      data: {
        churchId,
        name: `${automation.name} (manual)`,
        channel: automation.channel as Channel,
        body: renderTemplate(template, "{name}", church.name),
        segment: automation.trigger,
        sent,
        delivered: sent,
        status: "sent",
      },
    });
  }

  return { ok: true, sent };
}

type Target = {
  firstName: string;
  lastName: string;
  phone: string | null;
  visitorId?: string;
  personId?: string;
  giftIds?: string[];
};

async function targetsFor(
  churchId: string,
  trigger: string,
  mmdd: string,
  threeDaysAgo: Date,
  sevenDaysAgo: Date,
  now: Date,
  automation?: Automation,
): Promise<Target[]> {
  const select = { firstName: true, lastName: true, phone: true };
  switch (trigger) {
    case "birthday":
      return db.person.findMany({ where: { churchId, birthday: mmdd }, select });
    case "anniversary":
      return db.person.findMany({ where: { churchId, anniversary: mmdd }, select });
    case "visitor_followup": {
      // Queries Visitor directly (not Person) so the dedupe guard actually
      // sticks: welcomeSmsSentAt is set the moment this - or the instant send
      // on add/self-registration - reaches a visitor, so nobody gets texted
      // more than once no matter how many times this automation runs.
      // delayDays is per-church/per-automation (default 3): only visitors who
      // visited AT LEAST that long ago are eligible, so it actually behaves
      // like "follow up N days after the visit" instead of a fixed window.
      const delayDays = automation?.delayDays ?? 3;
      const cutoff = new Date(now.getTime() - delayDays * 86400000);
      const visitors = await db.visitor.findMany({
        where: { churchId, welcomeSmsSentAt: null, createdAt: { lte: cutoff } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      return visitors.map((v) => ({ firstName: v.firstName, lastName: v.lastName, phone: v.phone, visitorId: v.id }));
    }
    case "lapsed": {
      // Dedupe guard: once texted, a person won't be texted again for the same
      // lapse - lapsedSmsSentAt is cleared when they return to active (see
      // updatePerson), so a future lapse is free to fire again.
      const people = await db.person.findMany({
        where: { churchId, status: "inactive", lapsedSmsSentAt: null },
        select: { id: true, ...select },
      });
      return people.map((p) => ({ ...p, personId: p.id }));
    }
    case "new_member": {
      // Dedupe guard: welcome each new member exactly once, not on every
      // hourly run for the whole 7-day eligibility window.
      const people = await db.person.findMany({
        where: { churchId, status: "active", joinedAt: { gte: sevenDaysAgo }, newMemberWelcomeSentAt: null },
        select: { id: true, ...select },
      });
      return people.map((p) => ({ ...p, personId: p.id }));
    }
    case "giving_thanks": {
      // Dedupe guard: thank a donor once per gift (thanksSentAt on the Gift
      // itself, not the person) - so a second gift still gets its own thank-you,
      // but the same gift never re-fires on every hourly run within the window.
      const recentGifts = await db.gift.findMany({
        where: { churchId, date: { gte: sevenDaysAgo }, thanksSentAt: null, personId: { not: null } },
        select: { id: true, personId: true },
      });
      const byPerson = new Map<string, string[]>();
      for (const g of recentGifts) {
        if (!g.personId) continue;
        byPerson.set(g.personId, [...(byPerson.get(g.personId) ?? []), g.id]);
      }
      if (byPerson.size === 0) return [];
      const people = await db.person.findMany({ where: { id: { in: [...byPerson.keys()] }, churchId }, select: { id: true, ...select } });
      return people.map((p) => ({ ...p, personId: p.id, giftIds: byPerson.get(p.id) ?? [] }));
    }
    default:
      return [];
  }
}
