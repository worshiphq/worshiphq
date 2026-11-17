// Levy periods, worked out on local calendar days (YYYY-MM-DD) in the church's time zone. Pure: no server imports.
import { zonedToUtc, ymdInTz } from "@/lib/time/tz";
import type { Frequency, PeriodWindow } from "./types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

const pad = (n: number) => String(n).padStart(2, "0");
export const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}

/** Add whole days to a local day. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymdOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Add whole months to the first day of a month. */
function addMonths(y: number, m: number, n: number): [number, number] {
  const idx = y * 12 + (m - 1) + n;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** The financial year a month sits in (the calendar year the financial year starts in). */
function fyOf(y: number, m: number, ysm: number): number {
  return m >= ysm ? y : y - 1;
}

/** The period key a local day falls in: 2026-11, 2026-Q1 (quarters of the financial year) or 2026 (the financial year). */
export function periodKeyFor(ymd: string, freq: Frequency, yearStartMonth = 1): string {
  const [y, m] = parts(ymd);
  const ysm = clampMonth(yearStartMonth);
  if (freq === "monthly") return `${y}-${pad(m)}`;
  const fy = fyOf(y, m, ysm);
  if (freq === "yearly") return String(fy);
  const q = Math.floor(((m - ysm + 12) % 12) / 3) + 1;
  return `${fy}-Q${q}`;
}

export const clampMonth = (m: number) => (Number.isInteger(m) && m >= 1 && m <= 12 ? m : 1);

/** First day and first day after (exclusive) of a period. */
export function periodBoundsYmd(key: string, freq: Frequency, yearStartMonth = 1): PeriodWindow {
  const ysm = clampMonth(yearStartMonth);
  if (freq === "monthly") {
    const [y, m] = key.split("-").map(Number);
    const [ny, nm] = addMonths(y, m, 1);
    return { key, startYmd: ymdOf(y, m, 1), endYmd: ymdOf(ny, nm, 1) };
  }
  if (freq === "quarterly") {
    const [fyS, qS] = key.split("-Q");
    const [sy, sm] = addMonths(Number(fyS), ysm, (Number(qS) - 1) * 3);
    const [ey, em] = addMonths(sy, sm, 3);
    return { key, startYmd: ymdOf(sy, sm, 1), endYmd: ymdOf(ey, em, 1) };
  }
  const fy = Number(key);
  const [ey, em] = addMonths(fy, ysm, 12);
  return { key, startYmd: ymdOf(fy, ysm, 1), endYmd: ymdOf(ey, em, 1) };
}

/** The same bounds as instants: local midnight in the church's time zone. */
export function periodBounds(key: string, freq: Frequency, yearStartMonth: number, tz: string): PeriodWindow & { start: Date; end: Date } {
  const w = periodBoundsYmd(key, freq, yearStartMonth);
  return { ...w, start: zonedToUtc(w.startYmd, "00:00", tz), end: zonedToUtc(w.endYmd, "00:00", tz) };
}

/** Local midnight of a day, as an instant. */
export const dayStart = (ymd: string, tz: string) => zonedToUtc(ymd, "00:00", tz);
/** The local day an instant falls on. */
export const localDay = (d: Date, tz: string) => ymdInTz(d, tz);

/** Every period from the one holding `fromYmd` to the one holding `toYmd` (inclusive), oldest first. */
export function periodsBetween(fromYmd: string, toYmd: string, freq: Frequency, yearStartMonth = 1): PeriodWindow[] {
  if (fromYmd > toYmd) return [];
  const out: PeriodWindow[] = [];
  let w = periodBoundsYmd(periodKeyFor(fromYmd, freq, yearStartMonth), freq, yearStartMonth);
  const lastKey = periodKeyFor(toYmd, freq, yearStartMonth);
  for (let guard = 0; guard < 400; guard++) {
    out.push(w);
    if (w.key === lastKey) break;
    w = periodBoundsYmd(periodKeyFor(w.endYmd, freq, yearStartMonth), freq, yearStartMonth);
  }
  return out;
}

/** The first day of the next period after the one holding `ymd`. */
export function nextPeriodStart(ymd: string, freq: Frequency, yearStartMonth = 1): string {
  return periodBoundsYmd(periodKeyFor(ymd, freq, yearStartMonth), freq, yearStartMonth).endYmd;
}

/** The first day of the period holding `ymd`. */
export function periodStartOf(ymd: string, freq: Frequency, yearStartMonth = 1): string {
  return periodBoundsYmd(periodKeyFor(ymd, freq, yearStartMonth), freq, yearStartMonth).startYmd;
}

/** "November 2026", "Oct to Dec 2026", "Nov 2026 to Jan 2027", "Year from Jan 2026". */
export function periodLabel(key: string, freq: Frequency, yearStartMonth = 1): string {
  const w = periodBoundsYmd(key, freq, yearStartMonth);
  const [sy, sm] = parts(w.startYmd);
  if (freq === "monthly") return `${MONTHS[sm - 1]} ${sy}`;
  const last = addDays(w.endYmd, -1);
  const [ly, lm] = parts(last);
  if (freq === "yearly") return ysmLabel(sy, sm);
  return sy === ly ? `${SHORT[sm - 1]} to ${SHORT[lm - 1]} ${sy}` : `${SHORT[sm - 1]} ${sy} to ${SHORT[lm - 1]} ${ly}`;
}
const ysmLabel = (y: number, m: number) => `Year from ${SHORT[m - 1]} ${y}`;

/** Short label for a chip: "Nov", "Q1", "2026". */
export function periodShort(key: string, freq: Frequency): string {
  if (freq === "monthly") return SHORT[Number(key.split("-")[1]) - 1];
  if (freq === "quarterly") return `Q${key.split("-Q")[1]}`;
  return key;
}

/**
 * The day a period's levy is due: `dueDays` days after the period's last day. November with 15 days is due 15 December.
 * 0 means due on the last day of the period.
 */
export function dueYmdFor(endYmd: string, dueDays: number): string {
  const d = Number.isInteger(dueDays) && dueDays >= 0 ? dueDays : 15;
  return addDays(endYmd, d - 1);
}

/** "15 Dec" or "15 Dec 2027" when not this year. */
export function shortDate(ymd: string, thisYear?: number): string {
  const [y, m, d] = parts(ymd);
  return `${d} ${SHORT[m - 1]}${thisYear !== undefined && thisYear !== y ? ` ${y}` : ""}`;
}

/** "1 December 2026". */
export function longDate(ymd: string): string {
  const [y, m, d] = parts(ymd);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const MONTH_NAMES = MONTHS;
export const MONTH_SHORT = SHORT;

/** Months between, for "today minus 24 months". */
export function addMonthsYmd(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const [ny, nm] = addMonths(y, m, n);
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ymdOf(ny, nm, Math.min(d, dim));
}
