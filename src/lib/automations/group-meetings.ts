import "server-only";
import { db } from "@/lib/db";
import { localParts, ymdInTz } from "@/lib/time/tz";
import { DAYS_FULL, DEFAULT_MEETING_REMINDER, renderMeetingReminder } from "@/lib/groups/meeting-reminder";
import { sendChurchSms } from "@/lib/sms/credits";

/**
 * Auto meeting reminders: for each group with an automatic reminder on, text its
 * members when their meeting day is `leadDays` away, at the group's own local
 * hour. Runs hourly; a per-day guard (meetingReminderLastSent) prevents doubles.
 * Groups set to manual are skipped here (they use the "Send now" button).
 */
export async function runGroupMeetingReminders(now = new Date(), ignoreHour = false) {
  const churches = await db.church.findMany({
    where: { isDemo: false, groups: { some: { meetingReminderOn: true, meetingReminderAuto: true } } },
    select: { id: true, name: true, timezone: true },
  });

  let sent = 0;
  for (const church of churches) {
    const { hour } = localParts(now, church.timezone);
    const todayYmd = ymdInTz(now, church.timezone);

    const groups = await db.group.findMany({
      where: { churchId: church.id, meetingReminderOn: true, meetingReminderAuto: true },
      select: {
        id: true, name: true, meetingDays: true, meetingDay: true, meetingTime: true,
        meetingReminderText: true, meetingReminderLeadDays: true, meetingReminderHour: true,
        meetingReminderLastSent: true,
        members: { where: { phone: { not: null } }, select: { phone: true } },
      },
    });

    for (const g of groups) {
      if (!ignoreHour && hour !== g.meetingReminderHour) continue;
      if (g.meetingReminderLastSent === todayYmd) continue; // already sent today

      const days = g.meetingDays.length ? g.meetingDays : g.meetingDay ? [g.meetingDay] : [];
      if (days.length === 0) continue;

      // Is the meeting `leadDays` from now (in the church's timezone) one of the days?
      const target = new Date(now.getTime() + g.meetingReminderLeadDays * 86400000);
      const targetDayName = DAYS_FULL[localParts(target, church.timezone).weekday];
      if (!days.includes(targetDayName)) continue;

      const phones = g.members.map((m) => m.phone!).filter(Boolean);
      if (phones.length === 0) continue;

      const text = renderMeetingReminder(g.meetingReminderText ?? DEFAULT_MEETING_REMINDER, {
        church: church.name, group: g.name, days, time: g.meetingTime,
      });
      const res = await sendChurchSms(church.id, phones, text, { note: `Meeting reminder: ${g.name}` });
      if (!res.ok && res.insufficient) break; // out of credits; retry next hour
      await db.group.update({ where: { id: g.id }, data: { meetingReminderLastSent: todayYmd } });
      if (res.ok) sent += res.sent;
    }
  }

  return { churches: churches.length, sent };
}
