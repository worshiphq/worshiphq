import "server-only";
import { db } from "@/lib/db";
import { localParts, ymdInTz } from "@/lib/time/tz";
import { templateFor, renderTemplate } from "@/lib/messages/registry";
import { sendChurchSms } from "@/lib/sms/credits";
import { buildRosterBody } from "@/lib/rosters/message";

const fmtServiceDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/**
 * Auto-send roster (service-sheet) announcements to a group ahead of the first
 * service. Each sheet may set its own lead-days/hour, falling back to the
 * church-wide default. Runs hourly; once per sheet (guarded by announcedAt).
 */
export async function runRosterAnnouncements(now = new Date(), ignoreHour = false) {
  const churches = await db.church.findMany({
    where: { isDemo: false, rosterAnnounceOn: true },
    select: {
      id: true, name: true, timezone: true, messageTemplates: true,
      rosterAnnounceHour: true, rosterAnnounceLeadDays: true,
      rosterAnnounceAudience: true, rosterAnnounceGroupId: true,
    },
  });

  let sent = 0;
  for (const church of churches) {
    const { hour } = localParts(now, church.timezone);

    // Wide window; each sheet's own lead-days decides whether today is the day.
    const from = new Date(now.getTime() - 2 * 86400000);
    const to = new Date(now.getTime() + 33 * 86400000);
    const sheets = await db.volunteerRoster.findMany({
      where: { churchId: church.id, announcedAt: null, startDate: { gte: from, lte: to } },
      include: { slots: { orderBy: { date: "asc" } } },
    });
    if (sheets.length === 0) continue;

    // Resolve recipients once per church.
    let phones: string[] = [];
    if (church.rosterAnnounceAudience === "church") {
      const people = await db.person.findMany({ where: { churchId: church.id, status: { not: "inactive" }, phone: { not: null } }, select: { phone: true } });
      phones = people.map((p) => p.phone!).filter(Boolean);
    } else if (church.rosterAnnounceGroupId) {
      const group = await db.group.findFirst({
        where: { id: church.rosterAnnounceGroupId, churchId: church.id },
        select: { members: { where: { phone: { not: null } }, select: { phone: true } } },
      });
      phones = (group?.members ?? []).map((m) => m.phone!).filter(Boolean);
    }
    if (phones.length === 0) continue;

    const tpl = templateFor(church.messageTemplates, "roster_announcement");
    for (const sheet of sheets) {
      if (sheet.slots.length === 0) continue;
      const lead = sheet.announceLeadDays ?? church.rosterAnnounceLeadDays;
      const sendHour = sheet.announceHour ?? church.rosterAnnounceHour;
      if (!ignoreHour && hour !== sendHour) continue;
      // Announce `lead` days before the first service.
      if (ymdInTz(sheet.startDate, church.timezone) !== ymdInTz(now, church.timezone, lead)) continue;

      const text = renderTemplate(tpl, {
        church: church.name, service: sheet.name, date: fmtServiceDate(sheet.startDate), list: buildRosterBody(sheet.slots),
      });
      const res = await sendChurchSms(church.id, phones, text, { note: "Roster announcement" });
      if (!res.ok && res.insufficient) break; // out of credits; try next church next hour
      await db.volunteerRoster.update({ where: { id: sheet.id }, data: { announcedAt: new Date() } });
      if (res.ok) sent += res.sent;
    }
  }

  return { churches: churches.length, sent };
}
