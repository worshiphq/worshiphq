import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { localParts, ymdInTz, timeReached } from "@/lib/time/tz";
import { DAYS_FULL, DEFAULT_MEETING_REMINDER, renderMeetingReminder, parseSchedule, effectiveRemind, type ScheduleEntry } from "@/lib/groups/meeting-reminder";
import { sendChurchSms } from "@/lib/sms/credits";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";

/**
 * Auto meeting reminders. Every meeting day can carry its own timing (e.g. the
 * Sunday meeting is reminded the day before, the Wednesday one that morning);
 * a day without its own timing follows the group's default. Runs hourly; each
 * meeting is reminded once, guarded so it never doubles up.
 *
 *  - Days with their own timing: guarded per day by the meeting DATE that was
 *    reminded (meetingReminderSent), so each meeting is texted exactly once.
 *  - Days on the group default: unchanged from before, guarded once a day by
 *    meetingReminderLastSent.
 * Groups set to manual are skipped here (they use the "Send now" button).
 */
export async function runGroupMeetingReminders(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const churches = await db.church.findMany({
    where: { isDemo: false, groups: { some: { meetingReminderOn: true, meetingReminderAuto: true } } },
    select: { id: true, name: true, timezone: true },
  });

  let sent = 0;
  const pool = await forEachChurch(churches, async (church) => {
    const { weekday: todayWeekday } = localParts(now, church.timezone);
    const todayYmd = ymdInTz(now, church.timezone);

    const groups = await db.group.findMany({
      where: { churchId: church.id, meetingReminderOn: true, meetingReminderAuto: true },
      select: {
        id: true, name: true, meetingSchedule: true, meetingDays: true, meetingDay: true, meetingTime: true,
        meetingReminderText: true, meetingReminderLeadDays: true, meetingReminderHour: true, meetingReminderMinute: true, meetingReminderWeekday: true,
        meetingReminderLastSent: true, meetingReminderSent: true,
        members: { where: { phone: { not: null } }, select: { phone: true } },
      },
    });

    for (const g of groups) {
      let schedule = parseSchedule(g.meetingSchedule);
      if (schedule.length === 0 && g.meetingDay) schedule = [{ day: g.meetingDay, time: g.meetingTime }];
      if (schedule.length === 0) continue;

      const defaults = { leadDays: g.meetingReminderLeadDays, hour: g.meetingReminderHour, minute: g.meetingReminderMinute, weekday: g.meetingReminderWeekday };
      const sentMap = (g.meetingReminderSent && typeof g.meetingReminderSent === "object" && !Array.isArray(g.meetingReminderSent)
        ? { ...(g.meetingReminderSent as Record<string, string>) } : {}) as Record<string, string>;

      // Work out which meetings are due right now.
      const due: ScheduleEntry[] = [];
      const dueOwn: { day: string; meetingYmd: string }[] = [];
      let dueDefault = false;
      for (const entry of schedule) {
        const r = effectiveRemind(entry, defaults);
        if (r.kind === "off") continue;
        if (!ignoreHour && !timeReached(now, church.timezone, r.hour, r.minute)) continue;

        if (r.kind === "weekday") {
          // Group default, absolute weekday: remind about ALL default-timed meetings that day.
          if (todayWeekday !== r.weekday || g.meetingReminderLastSent === todayYmd) continue;
          due.push(entry);
          dueDefault = true;
          continue;
        }
        const target = new Date(now.getTime() + r.leadDays * 86400000);
        if (DAYS_FULL[localParts(target, church.timezone).weekday] !== entry.day) continue;
        const meetingYmd = ymdInTz(now, church.timezone, r.leadDays);
        if (r.custom) {
          if (sentMap[entry.day] === meetingYmd) continue; // this meeting was already reminded
          due.push(entry);
          dueOwn.push({ day: entry.day, meetingYmd });
        } else {
          if (g.meetingReminderLastSent === todayYmd) continue;
          due.push(entry);
          dueDefault = true;
        }
      }
      if (due.length === 0) continue;

      const phones = g.members.map((m) => m.phone!).filter(Boolean);
      if (phones.length === 0) continue;

      const text = renderMeetingReminder(g.meetingReminderText ?? DEFAULT_MEETING_REMINDER, {
        church: church.name, group: g.name, schedule: due,
      });
      const res = await sendChurchSms(church.id, phones, text, { note: `Meeting reminder: ${g.name}` });
      if (!res.ok) { if (res.insufficient) break; continue; } // don't mark sent on failure

      for (const d of dueOwn) sentMap[d.day] = d.meetingYmd;
      await db.group.update({
        where: { id: g.id },
        data: {
          ...(dueDefault ? { meetingReminderLastSent: todayYmd } : {}),
          ...(dueOwn.length ? { meetingReminderSent: sentMap as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      sent += res.sent;
    }
  }, { deadline, label: "groupMeetings" });

  return { churches: churches.length, sent, ...pool };
}
