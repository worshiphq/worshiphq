// Client-safe helpers for group meeting reminders. Shared by the group form
// (preview), the server actions, and the cron automation. No server imports.
import { localParts, ymdInTz } from "@/lib/time/tz";

export const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DEFAULT_MEETING_REMINDER =
  "Reminder from {church}: {group} meets {when}. We look forward to seeing you!";

export const MEETING_REMINDER_PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: "church", hint: "Church name" },
  { key: "group", hint: "Group name" },
  { key: "when", hint: "Day(s) + time, e.g. “on Mondays & Thursdays at 6:00 PM”" },
  { key: "days", hint: "Just the day(s)" },
  { key: "time", hint: "Just the time" },
];

/** Order a set of weekday names Sun→Sat and join them nicely. */
export function formatDays(days: string[]): string {
  const ordered = DAYS_FULL.filter((d) => days.includes(d));
  if (ordered.length === 0) return "";
  if (ordered.length === 1) return ordered[0];
  if (ordered.length === 2) return `${ordered[0]} & ${ordered[1]}`;
  return `${ordered.slice(0, -1).join(", ")} & ${ordered[ordered.length - 1]}`;
}

/** "18:00" → "6:00 PM". Empty/invalid → "". */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${min} ${ap}`;
}

/** Build the human "when" phrase, e.g. "on Mondays & Thursdays at 6:00 PM". */
export function meetingWhen(days: string[], time: string | null | undefined): string {
  const d = formatDays(days);
  const t = formatTime(time);
  if (!d) return t ? `at ${t}` : "";
  return `on ${d}${t ? ` at ${t}` : ""}`;
}

const hour12 = (h: number) => { const ap = h < 12 ? "am" : "pm"; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:00 ${ap}`; };

/**
 * When the next automatic reminder for a group will fire, as a short label like
 * "Sun 24 Aug · 8:00 am" — or null if no meeting day is within the next 2 weeks.
 * Uses the church's timezone so it matches when the cron actually sends.
 */
export function nextGroupReminderLabel(opts: {
  meetingDays: string[];
  leadDays: number;
  hour: number;
  timezone: string;
  now?: Date;
}): string | null {
  if (opts.meetingDays.length === 0) return null;
  const now = opts.now ?? new Date();
  const nowHour = localParts(now, opts.timezone).hour;

  for (let offset = 0; offset < 14; offset++) {
    // The meeting this send would be for is `leadDays` after the send day.
    const meetingWeekday = localParts(new Date(now.getTime() + (offset + opts.leadDays) * 86400000), opts.timezone).weekday;
    if (!opts.meetingDays.includes(DAYS_FULL[meetingWeekday])) continue;
    if (offset === 0 && opts.hour <= nowHour) continue; // today's send-hour already passed

    const sendYmd = ymdInTz(now, opts.timezone, offset); // "YYYY-MM-DD"
    const sendWeekday = localParts(new Date(now.getTime() + offset * 86400000), opts.timezone).weekday;
    const mon = MONTHS_SHORT[parseInt(sendYmd.slice(5, 7), 10) - 1];
    const day = parseInt(sendYmd.slice(8, 10), 10);
    return `${DAYS_SHORT[sendWeekday]} ${day} ${mon} · ${hour12(opts.hour)}`;
  }
  return null;
}

export function renderMeetingReminder(
  template: string,
  vars: { church: string; group: string; days: string[]; time: string | null | undefined },
): string {
  const map: Record<string, string> = {
    church: vars.church,
    group: vars.group,
    when: meetingWhen(vars.days, vars.time),
    days: formatDays(vars.days),
    time: formatTime(vars.time),
  };
  return (template || DEFAULT_MEETING_REMINDER)
    .replace(/\{(\w+)\}/g, (_, k: string) => (k in map ? map[k] : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
