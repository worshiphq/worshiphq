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
      rosterAnnounceHour: true, rosterAnnounceLeadDays: true, rosterAnnounceWeekday: true,
      rosterAnnounceAudience: true, rosterAnnounceGroupId: true,
    },
  });

  let sent = 0;
  for (const church of churches) {
    const { hour, weekday: todayWeekday } = localParts(now, church.timezone);
    const todayYmd = ymdInTz(now, church.timezone);
    const plus7Ymd = ymdInTz(now, church.timezone, 7);

    // Wide window; each sheet's own schedule decides whether today is the day.
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

      // A roster that sets ANY timing field fully overrides the church schedule;
      // otherwise it inherits the church's mode + values.
      const override = sheet.announceHour != null || sheet.announceWeekday != null || sheet.announceLeadDays != null;
      const sendHour = override ? (sheet.announceHour ?? church.rosterAnnounceHour) : church.rosterAnnounceHour;
      const weekday = override ? sheet.announceWeekday : church.rosterAnnounceWeekday;
      const lead = override ? (sheet.announceLeadDays ?? 0) : church.rosterAnnounceLeadDays;
      if (!ignoreHour && hour !== sendHour) continue;

      const startYmd = ymdInTz(sheet.startDate, church.timezone);
      if (weekday != null) {
        // Absolute: send on the chosen weekday, for services within the next 7 days.
        if (todayWeekday !== weekday) continue;
        if (!(startYmd >= todayYmd && startYmd <= plus7Ymd)) continue;
      } else {
        // Relative: send `leadDays` before the first service.
        if (startYmd !== ymdInTz(now, church.timezone, lead)) continue;
      }

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
