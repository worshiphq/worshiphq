// Client-safe helpers for group meeting reminders. Shared by the group form
// (preview), the server actions, and the cron automation. No server imports.

export const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
