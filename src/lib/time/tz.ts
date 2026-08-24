/**
 * Timezone helpers for scheduled automations. Send-hours are stored per church
 * as a local hour (0-23) in the church's IANA timezone; the cron runs hourly and
 * fires each task when the church's local hour matches.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The church's local hour (0-23), minute (0-59), weekday (0=Sun..6=Sat) and MM-DD for `now`. */
export function localParts(now: Date, timeZone: string): { hour: number; minute: number; weekday: number; mmdd: string } {
  const tz = safeTz(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", weekday: "short", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10) % 24;
  const minute = parseInt(get("minute"), 10);
  const mmdd = `${get("month")}-${get("day")}`;
  const weekday = WEEKDAYS.indexOf(get("weekday"));
  return { hour: isNaN(hour) ? 0 : hour, minute: isNaN(minute) ? 0 : minute, weekday: weekday < 0 ? 0 : weekday, mmdd };
}

/** Has the church's local clock reached `sendHour:sendMinute` today? (fires at or
 *  after the target — guards elsewhere prevent duplicate sends). */
export function timeReached(now: Date, timeZone: string, sendHour: number, sendMinute: number): boolean {
  const { hour, minute } = localParts(now, timeZone);
  return hour > sendHour || (hour === sendHour && minute >= sendMinute);
}

/** YYYY-MM-DD in `timeZone` for `date` (+ optional `offsetDays`). */
export function ymdInTz(date: Date, timeZone: string, offsetDays = 0): string {
  const d = new Date(date.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** MM-DD in `timeZone` for `now` + `offsetDays`. */
export function mmddInTz(now: Date, timeZone: string, offsetDays = 0): string {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: safeTz(timeZone), month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}-${get("day")}`;
}

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Africa/Accra";
  }
}
