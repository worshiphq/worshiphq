import "server-only";
import { db } from "@/lib/db";
import { localParts, ymdInTz } from "@/lib/time/tz";
import { templateFor, renderTemplate } from "@/lib/messages/registry";
import { sendChurchSms } from "@/lib/sms/credits";

const fmtServiceDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/**
 * Auto-send roster (service-sheet) announcements to a group ahead of the
 * service. Runs hourly; each church fires at its own local hour, `leadDays`
 * before a service, once per sheet (guarded by announcedAt).
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
    if (!ignoreHour && hour !== church.rosterAnnounceHour) continue;

    // The service date we're announcing today = today + leadDays (local).
    const targetYmd = ymdInTz(now, church.timezone, church.rosterAnnounceLeadDays);

    // Candidate sheets in a window around the target, not yet announced.
    const from = new Date(now.getTime() - 2 * 86400000);
    const to = new Date(now.getTime() + (church.rosterAnnounceLeadDays + 3) * 86400000);
    const sheets = await db.volunteerRoster.findMany({
      where: { churchId: church.id, announcedAt: null, startDate: { gte: from, lte: to } },
      include: { slots: { orderBy: { createdAt: "asc" } } },
    });

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
      if (ymdInTz(sheet.startDate, church.timezone) !== targetYmd) continue;
      if (sheet.slots.length === 0) continue;
      const list = sheet.slots.map((s) => `${s.role}: ${s.personName ?? "-"}`).join("\n");
      const text = renderTemplate(tpl, {
        church: church.name, service: sheet.name, date: fmtServiceDate(sheet.startDate), list,
      });
      const res = await sendChurchSms(church.id, phones, text, { note: "Roster announcement" });
      if (!res.ok && res.insufficient) break; // out of credits; try next church next hour
      await db.volunteerRoster.update({ where: { id: sheet.id }, data: { announcedAt: new Date() } });
      if (res.ok) sent += res.sent;
    }
  }

  return { churches: churches.length, sent };
}
