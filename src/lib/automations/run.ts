import "server-only";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";
import type { Channel } from "@prisma/client";

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
    "Happy birthday, {name}! 🎉 The whole family at {church} is celebrating you today. May God bless your new year. — {church}",
  anniversary:
    "Happy anniversary, {name}! {church} celebrates God's faithfulness in your union. May your love keep growing. 💍",
  visitor_followup:
    "Hi {name}, it was a joy to have you at {church}! We'd love to see you again this Sunday. Reply if we can pray with you. 🙏",
  lapsed:
    "Hi {name}, we've missed you at {church}. You're always welcome — we'd love to reconnect. Is there any way we can support you? 🙏",
  new_member:
    "Welcome to {church}, {name}! We're so glad you've joined the family. God bless you richly! 🙌",
  giving_thanks:
    "Thank you for your generous giving, {name}. Your support helps {church} carry out its mission. God bless you! 🙏",
};

export const TRIGGER_CATALOG: Record<string, { name: string; description: string }> = {
  birthday: { name: "Birthday blessings", description: "Wishes a member happy birthday on the day." },
  anniversary: { name: "Anniversary wishes", description: "Celebrates a member's anniversary on the day." },
  visitor_followup: { name: "First-time visitor follow-up", description: "Welcomes new visitors a few days after they register." },
  lapsed: { name: "We miss you", description: "Gently checks in on members who've gone inactive." },
  new_member: { name: "New member welcome", description: "Welcomes newly registered members to the church." },
  giving_thanks: { name: "Giving thank you", description: "Thanks members who have given recently." },
};

function renderTemplate(template: string, firstName: string, churchName: string): string {
  return template
    .replace(/\{name\}/g, firstName)
    .replace(/\{church\}/g, churchName);
}

export async function runAutomations(now = new Date()): Promise<{
  ran: number;
  totalSent: number;
  outcomes: AutomationOutcome[];
}> {
  const churches = await db.church.findMany({
    where: { isDemo: false },
    select: { id: true, name: true },
  });

  const outcomes: AutomationOutcome[] = [];
  const mmdd = todayMMDD(now);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  for (const church of churches) {
    const automations = await db.automation.findMany({
      where: { churchId: church.id, active: true },
    });

    for (const a of automations) {
      const targets = await targetsFor(church.id, a.trigger, mmdd, threeDaysAgo, sevenDaysAgo);
      if (targets.length === 0) continue;

      const template = a.messageTemplate || DEFAULT_TEMPLATES[a.trigger] || "A message from {church}.";

      let sent = 0;
      for (const t of targets) {
        if (!t.phone) continue;
        const message = renderTemplate(template, t.firstName, church.name);
        const res = await sendChurchSms(church.id, t.phone, message, { note: `${a.name} (automated)` });
        if (res.insufficient) break;
        if (res.ok) sent++;
      }

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
  }

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

  const targets = await targetsFor(churchId, automation.trigger, mmdd, threeDaysAgo, sevenDaysAgo);
  if (targets.length === 0) return { ok: true, sent: 0, error: "No matching members found for this trigger right now." };

  const template = automation.messageTemplate || DEFAULT_TEMPLATES[automation.trigger] || "A message from {church}.";

  let sent = 0;
  for (const t of targets) {
    if (!t.phone) continue;
    const message = renderTemplate(template, t.firstName, church.name);
    const res = await sendChurchSms(churchId, t.phone, message, { note: `${automation.name} (manual run)` });
    if (res.insufficient) return { ok: false, sent, error: "Insufficient SMS credits." };
    if (res.ok) sent++;
  }

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

type Target = { firstName: string; lastName: string; phone: string | null };

async function targetsFor(
  churchId: string,
  trigger: string,
  mmdd: string,
  threeDaysAgo: Date,
  sevenDaysAgo: Date,
): Promise<Target[]> {
  const select = { firstName: true, lastName: true, phone: true };
  switch (trigger) {
    case "birthday":
      return db.person.findMany({ where: { churchId, birthday: mmdd }, select });
    case "anniversary":
      return db.person.findMany({ where: { churchId, anniversary: mmdd }, select });
    case "visitor_followup":
      return db.person.findMany({
        where: { churchId, status: "visitor", joinedAt: { gte: threeDaysAgo } },
        select,
      });
    case "lapsed":
      return db.person.findMany({ where: { churchId, status: "inactive" }, select });
    case "new_member":
      return db.person.findMany({
        where: { churchId, status: "active", joinedAt: { gte: sevenDaysAgo } },
        select,
      });
    case "giving_thanks":
      // Members who gave in the last 7 days
      const recentGifts = await db.gift.findMany({
        where: { churchId, date: { gte: sevenDaysAgo } },
        select: { personId: true },
        distinct: ["personId"],
      });
      const personIds = recentGifts.map((g) => g.personId).filter((id): id is string => !!id);
      if (personIds.length === 0) return [];
      return db.person.findMany({ where: { id: { in: personIds }, churchId }, select });
    default:
      return [];
  }
}
