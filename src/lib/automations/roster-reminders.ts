import "server-only";
import { db } from "@/lib/db";
import { localParts, ymdInTz, timeReached } from "@/lib/time/tz";
import { templateFor, renderTemplate } from "@/lib/messages/registry";
import { sendChurchSms } from "@/lib/sms/credits";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";
import { parseRemindOverride, resolveRemind } from "@/lib/rosters/remind";

/**
 * Personal roster reminders: text each rostered member their duty ahead of the
 * service. The timing is decided per service: a service's own setting wins, then
 * its roster sheet's, then the church default. So one sheet can remind Sunday's
 * team the day before and Wednesday's team that same morning.
 *
 * Runs hourly; each church fires at the local time each service is set for.
 * Guarded per slot by `remindedAt` so nobody is texted twice. Separate from the
 * group-wide announcement.
 */
export async function runRosterReminders(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const horizon = new Date(now.getTime() - 2 * 86400000);
  // Every church with reminders on, plus any with upcoming duties (a sheet or service
  // may carry its own timing even when the church-wide reminder is off).
  const churches = await db.church.findMany({
    where: {
      isDemo: false,
      OR: [
        { rosterRemindOn: true },
        { volunteerSlots: { some: { remindedAt: null, personId: { not: null }, date: { gte: horizon } } } },
      ],
    },
    select: { id: true, name: true, timezone: true, messageTemplates: true, rosterRemindOn: true, rosterRemindHour: true, rosterRemindMinute: true, rosterRemindLeadDays: true, rosterRemindWeekday: true },
  });

  const shortDate = (d: Date, tz: string) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz });

  let sent = 0;
  const pool = await forEachChurch(churches, async (church) => {
    const { weekday: todayWeekday } = localParts(now, church.timezone);
    const todayYmd = ymdInTz(now, church.timezone);
    const plus7Ymd = ymdInTz(now, church.timezone, 7);
    const churchRemind = {
      on: church.rosterRemindOn, leadDays: church.rosterRemindLeadDays, hour: church.rosterRemindHour,
      minute: church.rosterRemindMinute, weekday: church.rosterRemindWeekday,
    };

    // Candidate slots - a window wide enough for every mode - not yet reminded.
    const to = new Date(now.getTime() + 25 * 86400000);
    const slots = await db.volunteerSlot.findMany({
      where: { churchId: church.id, remindedAt: null, personId: { not: null }, date: { gte: horizon, lte: to }, roster: { deletedAt: null } },
      include: {
        person: { select: { firstName: true, phone: true, title: true } },
        roster: { select: { remindOverride: true } },
      },
      orderBy: { date: "asc" },
    });

    // Which slots are due right now? Each slot uses its own resolved timing.
    const due = slots.flatMap((s) => {
      if (!s.person?.phone) return [];
      const r = resolveRemind(parseRemindOverride(s.remindOverride), parseRemindOverride(s.roster.remindOverride), churchRemind);
      if (r.mode === "off") return [];
      if (!ignoreHour && !timeReached(now, church.timezone, r.hour, r.minute)) return [];
      const ymd = ymdInTz(s.date, church.timezone);
      if (r.mode === "weekday") {
        if (todayWeekday !== r.weekday) return [];
        return ymd >= todayYmd && ymd <= plus7Ymd ? [{ s, withDate: true }] : [];
      }
      return ymd === ymdInTz(now, church.timezone, r.leadDays) ? [{ s, withDate: false }] : [];
    });
    if (due.length === 0) return;

    // Group duties per person for a single tidy message.
    type Line = { withDate: boolean; text: string; date: Date };
    const byPerson = new Map<string, { phone: string; firstName: string; title: string; slotIds: string[]; lines: Line[]; dates: Set<string> }>();
    for (const { s, withDate } of due) {
      const key = s.personId!;
      const e = byPerson.get(key) ?? { phone: s.person!.phone!, firstName: s.person!.firstName, title: s.person!.title ?? "", slotIds: [], lines: [], dates: new Set<string>() };
      e.slotIds.push(s.id);
      e.dates.add(ymdInTz(s.date, church.timezone));
      // Weekday-mode duties can span several days, so they carry the date.
      e.lines.push({ withDate, text: `${s.service ? `${s.service}: ` : ""}${s.role}`, date: s.date });
      byPerson.set(key, e);
    }

    const tpl = templateFor(church.messageTemplates, "roster_reminder");
    for (const p of byPerson.values()) {
      // Show dates when a person's duties fall on more than one day.
      const multi = p.dates.size > 1;
      const lines = p.lines.map((l) => `- ${l.withDate || multi ? `${shortDate(l.date, church.timezone)} - ` : ""}${l.text}`);
      const text = renderTemplate(tpl, { title: p.title, name: p.firstName, church: church.name, duties: lines.join("\n") });
      const res = await sendChurchSms(church.id, p.phone, text, { note: "Roster reminder" });
      if (!res.ok) { if (res.insufficient) break; continue; } // don't mark reminded on failure
      await db.volunteerSlot.updateMany({ where: { id: { in: p.slotIds } }, data: { remindedAt: new Date() } });
      sent += res.sent;
    }
  }, { deadline, label: "rosterReminders" });

  return { churches: churches.length, sent, ...pool };
}
