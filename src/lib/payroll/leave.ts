/**
 * Staff & Payroll: working days and leave arithmetic. PURE (tsx-testable). Dates are calendar days handled in UTC
 * ("YYYY-MM-DD" or Date at UTC midnight), so a server's timezone never moves a day.
 */

export type DayLike = Date | string;

const DAY = 86_400_000;

/** "YYYY-MM-DD" for a date (its UTC calendar day). */
export function dayKey(d: DayLike): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function utc(d: DayLike): number {
  const k = dayKey(d);
  return Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
}

const isWeekday = (t: number) => {
  const wd = new Date(t).getUTCDay();
  return wd !== 0 && wd !== 6;
};

/** Mon to Fri in the month, minus holidays that fall on a weekday. */
export function workingDaysIn(year: number, month: number, holidays: DayLike[] = []): number {
  const hol = new Set(holidays.map(dayKey));
  let n = 0;
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  for (let t = start; t < end; t += DAY) {
    if (isWeekday(t) && !hol.has(new Date(t).toISOString().slice(0, 10))) n++;
  }
  return n;
}

/** Working days the run uses: weekdays (minus holidays) or the fixed number from settings. */
export function runWorkingDays(rule: string, fixed: number, year: number, month: number, holidays: DayLike[]): number {
  return rule === "fixed" ? Math.max(1, fixed) : Math.max(1, workingDaysIn(year, month, holidays));
}

/** Weekdays between start and end inclusive, minus holidays; 0.5 for a half day. */
export function countLeaveDays(start: DayLike, end: DayLike, holidays: DayLike[] = [], halfDay = false): number {
  const a = utc(start);
  const b = utc(end);
  if (b < a) return 0;
  if (halfDay) return isWeekday(a) && !holidays.map(dayKey).includes(dayKey(start)) ? 0.5 : 0;
  const hol = new Set(holidays.map(dayKey));
  let n = 0;
  for (let t = a; t <= b; t += DAY) if (isWeekday(t) && !hol.has(new Date(t).toISOString().slice(0, 10))) n++;
  return n;
}

/** Round down to the nearest half day. */
export const floorHalf = (n: number) => Math.floor(n * 2 + 1e-9) / 2;

/**
 * Entitlement for the year. Someone who started during the year gets daysPerYear x remainingMonths / 12 (the start
 * month counts), rounded down to a half day.
 */
export function entitlementFor(daysPerYear: number, year: number, startDate?: DayLike | null): number {
  if (!startDate) return daysPerYear;
  const k = dayKey(startDate);
  const sy = Number(k.slice(0, 4));
  const sm = Number(k.slice(5, 7));
  if (sy > year) return 0;
  if (sy < year) return daysPerYear;
  return floorHalf((daysPerYear * (12 - sm + 1)) / 12);
}

/** entitlement + adjustments - approved days taken. */
export function leaveBalance(entitlement: number, adjustments: number[], approvedDays: number[]): number {
  const adj = adjustments.reduce((t, n) => t + n, 0);
  const used = approvedDays.reduce((t, n) => t + n, 0);
  return Math.round((entitlement + adj - used) * 100) / 100;
}

/** The days of a leave request that fall inside a month (clipped), for the unpaid-leave feed into a run. */
export function unpaidDaysInMonth(
  req: { startDate: DayLike; endDate: DayLike; halfDay?: boolean; days?: number },
  year: number,
  month: number,
  holidays: DayLike[] = [],
): number {
  const ms = Date.UTC(year, month - 1, 1);
  const me = Date.UTC(year, month, 0);
  const a = Math.max(utc(req.startDate), ms);
  const b = Math.min(utc(req.endDate), me);
  if (b < a) return 0;
  if (req.halfDay) return countLeaveDays(new Date(a), new Date(b), holidays, true);
  return countLeaveDays(new Date(a), new Date(b), holidays);
}

/** Year of a date. */
export const yearOf = (d: DayLike) => Number(dayKey(d).slice(0, 4));
