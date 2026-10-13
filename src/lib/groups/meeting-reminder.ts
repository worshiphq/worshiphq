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

/** A meeting day's own reminder timing. Absent = follow the group's default. */
export type DayRemind = {
  /** true = never remind for this day. */
  off?: boolean;
  /** Days before the meeting (0 = the same day). */
  leadDays: number;
  hour: number;
  minute: number;
};

export type ScheduleEntry = { day: string; time: string | null; remind?: DayRemind };

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Clean up a stored per-day reminder, or null when the day follows the default. */
export function parseDayRemind(raw: unknown): DayRemind | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.off === true) return { off: true, leadDays: 0, hour: 8, minute: 0 };
  return { leadDays: clampInt(r.leadDays, 0, 14, 0), hour: clampInt(r.hour, 0, 23, 8), minute: clampInt(r.minute, 0, 59, 0) };
}

/** Coerce whatever is stored in Group.meetingSchedule (Json) into clean entries,
 *  ordered Sun→Sat and de-duped by day. */
export function parseSchedule(raw: unknown): ScheduleEntry[] {
  const arr = Array.isArray(raw) ? raw : [];
  const byDay = new Map<string, { time: string | null; remind?: DayRemind }>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const day = String((item as { day?: unknown }).day ?? "").trim();
    if (!DAYS_FULL.includes(day)) continue;
    const t = String((item as { time?: unknown }).time ?? "").trim();
    byDay.set(day, { time: t || null, remind: parseDayRemind((item as { remind?: unknown }).remind) });
  }
  return DAYS_FULL.filter((d) => byDay.has(d)).map((d) => {
    const e = byDay.get(d)!;
    return e.remind ? { day: d, time: e.time, remind: e.remind } : { day: d, time: e.time };
  });
}

/** "the day before at 6:00 PM", "the same day at 7:00 AM", "3 days before at 8:00 AM". */
export function describeLead(leadDays: number, hour: number, minute = 0): string {
  const when = leadDays === 0 ? "the same day" : leadDays === 1 ? "the day before" : `${leadDays} days before`;
  return `${when} at ${formatTime(`${hour}:${String(minute).padStart(2, "0")}`)}`;
}

/** Order a set of weekday names Sun→Sat and join them nicely. */
export function formatDays(days: string[]): string {
  const ordered = DAYS_FULL.filter((d) => days.includes(d));
  if (ordered.length === 0) return "";
  if (ordered.length === 1) return ordered[0];
  if (ordered.length === 2) return `${ordered[0]} & ${ordered[1]}`;
  return `${ordered.slice(0, -1).join(", ")} & ${ordered[ordered.length - 1]}`;
}

const joinList = (parts: string[]): string => {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
};

/** "Monday at 6:00 PM & Thursday at 5:30 PM" - each day with its own time. */
export function formatSchedule(schedule: ScheduleEntry[]): string {
  const ordered = DAYS_FULL.map((d) => schedule.find((s) => s.day === d)).filter(Boolean) as ScheduleEntry[];
  return joinList(ordered.map((s) => (s.time ? `${s.day} at ${formatTime(s.time)}` : s.day)));
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

/** Build the human "when" phrase, e.g. "on Monday at 6:00 PM & Thursday at 5:30 PM". */
export function meetingWhen(schedule: ScheduleEntry[]): string {
  const s = formatSchedule(schedule);
  return s ? `on ${s}` : "";
}

const hour12 = (h: number, m = 0) => { const ap = h < 12 ? "am" : "pm"; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:${String(m).padStart(2, "0")} ${ap}`; };

/**
 * When the next automatic reminder for a group will fire, as a short label like
 * "Sun 24 Aug · 8:00 am" - or null if no meeting day is within the next 2 weeks.
 * Uses the church's timezone so it matches when the cron actually sends.
 */
export function nextGroupReminderLabel(opts: {
  meetingDays: string[];
  leadDays: number;
  hour: number;
  minute?: number;
  weekday?: number | null; // when set, absolute weekday mode
  timezone: string;
  now?: Date;
}): string | null {
  if (opts.meetingDays.length === 0) return null;
  const now = opts.now ?? new Date();
  const minute = opts.minute ?? 0;
  const { hour: nowHour, minute: nowMinute } = localParts(now, opts.timezone);
  const passedToday = opts.hour < nowHour || (opts.hour === nowHour && minute <= nowMinute);

  const label = (offset: number) => {
    const sendYmd = ymdInTz(now, opts.timezone, offset);
    const sendWeekday = localParts(new Date(now.getTime() + offset * 86400000), opts.timezone).weekday;
    const mon = MONTHS_SHORT[parseInt(sendYmd.slice(5, 7), 10) - 1];
    const day = parseInt(sendYmd.slice(8, 10), 10);
    return `${DAYS_SHORT[sendWeekday]} ${day} ${mon} · ${hour12(opts.hour, minute)}`;
  };

  // Absolute weekday: the next occurrence of that weekday at the chosen time.
  if (opts.weekday != null) {
    for (let offset = 0; offset < 8; offset++) {
      const wd = localParts(new Date(now.getTime() + offset * 86400000), opts.timezone).weekday;
      if (wd !== opts.weekday) continue;
      if (offset === 0 && passedToday) continue;
      return label(offset);
    }
    return null;
  }

  // Relative: send `leadDays` before a meeting day.
  for (let offset = 0; offset < 14; offset++) {
    const meetingWeekday = localParts(new Date(now.getTime() + (offset + opts.leadDays) * 86400000), opts.timezone).weekday;
    if (!opts.meetingDays.includes(DAYS_FULL[meetingWeekday])) continue;
    if (offset === 0 && passedToday) continue;
    return label(offset);
  }
  return null;
}

/** One group's reminder timing for a single meeting day, resolved against the group default. */
export type EffectiveRemind =
  | { kind: "off" }
  | { kind: "relative"; leadDays: number; hour: number; minute: number; custom: boolean }
  | { kind: "weekday"; weekday: number; hour: number; minute: number };

export type GroupRemindDefaults = { leadDays: number; hour: number; minute: number; weekday: number | null };

/** The timing that actually applies to a meeting day: its own, or the group's default. */
export function effectiveRemind(entry: ScheduleEntry, d: GroupRemindDefaults): EffectiveRemind {
  if (entry.remind?.off) return { kind: "off" };
  if (entry.remind) return { kind: "relative", leadDays: entry.remind.leadDays, hour: entry.remind.hour, minute: entry.remind.minute, custom: true };
  if (d.weekday != null) return { kind: "weekday", weekday: d.weekday, hour: d.hour, minute: d.minute };
  return { kind: "relative", leadDays: d.leadDays, hour: d.hour, minute: d.minute, custom: false };
}

/**
 * When the next automatic reminder for a group will fire, taking each meeting
 * day's own timing into account, e.g. "Sat 18 Oct · 6:00 pm". Null if nothing is
 * due in the next two weeks. Uses the church timezone so it matches the cron.
 */
export function nextGroupReminderFromSchedule(opts: {
  schedule: ScheduleEntry[];
  defaults: GroupRemindDefaults;
  timezone: string;
  now?: Date;
}): string | null {
  const now = opts.now ?? new Date();
  const { hour: nowHour, minute: nowMinute } = localParts(now, opts.timezone);
  const nowMins = nowHour * 60 + nowMinute;

  let best: { offset: number; mins: number } | null = null;
  const consider = (offset: number, hour: number, minute: number) => {
    const mins = hour * 60 + minute;
    if (offset === 0 && mins <= nowMins) return; // already passed today
    if (!best || offset < best.offset || (offset === best.offset && mins < best.mins)) best = { offset, mins };
  };

  const eff = opts.schedule.map((e) => ({ e, r: effectiveRemind(e, opts.defaults) }));
  for (let offset = 0; offset < 15; offset++) {
    const sendWeekday = localParts(new Date(now.getTime() + offset * 86400000), opts.timezone).weekday;
    for (const { e, r } of eff) {
      if (r.kind === "off") continue;
      if (r.kind === "weekday") { if (sendWeekday === r.weekday) consider(offset, r.hour, r.minute); continue; }
      const meetingWeekday = localParts(new Date(now.getTime() + (offset + r.leadDays) * 86400000), opts.timezone).weekday;
      if (DAYS_FULL[meetingWeekday] === e.day) consider(offset, r.hour, r.minute);
    }
  }
  if (!best) return null;
  const { offset, mins } = best as { offset: number; mins: number };
  const sendYmd = ymdInTz(now, opts.timezone, offset);
  const sendWeekday = localParts(new Date(now.getTime() + offset * 86400000), opts.timezone).weekday;
  const mon = MONTHS_SHORT[parseInt(sendYmd.slice(5, 7), 10) - 1];
  return `${DAYS_SHORT[sendWeekday]} ${parseInt(sendYmd.slice(8, 10), 10)} ${mon} · ${hour12(Math.floor(mins / 60), mins % 60)}`;
}

export function renderMeetingReminder(
  template: string,
  vars: { church: string; group: string; schedule: ScheduleEntry[] },
): string {
  const days = vars.schedule.map((s) => s.day);
  // {time} is only meaningful when there's a single time - else use {when}.
  const singleTime = vars.schedule.length === 1 ? formatTime(vars.schedule[0].time) : "";
  const map: Record<string, string> = {
    church: vars.church,
    group: vars.group,
    when: meetingWhen(vars.schedule),
    days: formatDays(days),
    time: singleTime,
  };
  return (template || DEFAULT_MEETING_REMINDER)
    .replace(/\{(\w+)\}/g, (_, k: string) => (k in map ? map[k] : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
