import "server-only";
import { db } from "@/lib/db";
import { localParts, ymdInTz } from "@/lib/time/tz";
import { templateFor, renderTemplate } from "@/lib/messages/registry";
import { sendChurchSms } from "@/lib/sms/credits";

/**
 * Personal roster reminders: text each rostered member their duty a set number
 * of days before it (default 1 = "your service tomorrow"). Runs hourly; each
 * church fires at its own local hour. Guarded per slot by `remindedAt` so nobody
 * is texted twice. Separate from the group-wide announcement.
 */
export async function runRosterReminders(now = new Date(), ignoreHour = false) {
  const churches = await db.church.findMany({
    where: { isDemo: false, rosterRemindOn: true },
    select: { id: true, name: true, timezone: true, messageTemplates: true, rosterRemindHour: true, rosterRemindLeadDays: true },
  });

  let sent = 0;
  for (const church of churches) {
    const { hour } = localParts(now, church.timezone);
    if (!ignoreHour && hour !== church.rosterRemindHour) continue;

    // The duty date we're reminding about today = today + leadDays (local).
    const targetYmd = ymdInTz(now, church.timezone, church.rosterRemindLeadDays);

    // Candidate slots in a window around the target, not yet reminded.
    const from = new Date(now.getTime() - 2 * 86400000);
    const to = new Date(now.getTime() + (church.rosterRemindLeadDays + 3) * 86400000);
    const slots = await db.volunteerSlot.findMany({
      where: {
        churchId: church.id,
        remindedAt: null,
        personId: { not: null },
        date: { gte: from, lte: to },
      },
      include: { person: { select: { firstName: true, phone: true, title: true } } },
      orderBy: { date: "asc" },
    });

    // Keep only the slots whose local duty date is the target, and that have a phone.
    const due = slots.filter((s) => s.person?.phone && ymdInTz(s.date, church.timezone) === targetYmd);
    if (due.length === 0) continue;

    // Group duties per person for a single tidy message.
    const byPerson = new Map<string, { phone: string; firstName: string; title: string; slotIds: string[]; lines: string[] }>();
    for (const s of due) {
      const key = s.personId!;
      const e = byPerson.get(key) ?? { phone: s.person!.phone!, firstName: s.person!.firstName, title: s.person!.title ?? "", slotIds: [], lines: [] };
      e.slotIds.push(s.id);
      e.lines.push(`- ${s.service ? `${s.service}: ` : ""}${s.role}`);
      byPerson.set(key, e);
    }

    const tpl = templateFor(church.messageTemplates, "roster_reminder");
    for (const p of byPerson.values()) {
      const text = renderTemplate(tpl, { title: p.title, name: p.firstName, church: church.name, duties: p.lines.join("\n") });
      const res = await sendChurchSms(church.id, p.phone, text, { note: "Roster reminder" });
      if (!res.ok && res.insufficient) break; // out of credits; try again next hour
      await db.volunteerSlot.updateMany({ where: { id: { in: p.slotIds } }, data: { remindedAt: new Date() } });
      if (res.ok) sent += res.sent;
    }
  }

  return { churches: churches.length, sent };
}
