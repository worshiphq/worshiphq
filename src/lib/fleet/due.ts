/**
 * When papers run out and when a service is due. Pure, so tests and the daily alert share it.
 * Days are counted on calendar dates (UTC, which is Ghana's time), never on hours.
 */

export type DueState = "ok" | "soon" | "overdue" | "unset";

const DAY = 86_400_000;
const dayNum = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY);

/** Whole days from `today` to `date` (negative once it has passed). */
export function daysUntil(date: Date | string, today: Date = new Date()): number {
  return dayNum(new Date(date)) - dayNum(today);
}

/** A paper's state: "soon" is 30 days or less, "overdue" once the date has passed. */
export function expiryState(date: Date | string | null | undefined, today: Date = new Date(), soonDays = 30): { days: number | null; state: DueState } {
  if (!date) return { days: null, state: "unset" };
  const days = daysUntil(date, today);
  return { days, state: days < 0 ? "overdue" : days <= soonDays ? "soon" : "ok" };
}

export type ServiceRule = { everyDays?: number | null; everyKm?: number | null; lastDoneAt?: Date | string | null; lastDoneKm?: number | null };

export type ServiceDue = { dueAt: Date | null; dueKm: number | null; state: DueState; reason: string; daysLeft: number | null; kmLeft: number | null };

/** The km window counted as "soon": 500 km, or 15% of the interval on long intervals. */
export const soonKm = (everyKm: number) => Math.max(500, Math.round(everyKm * 0.15));
export const SOON_DAYS = 14;

/**
 * When a scheduled service is next due, by date and/or distance, whichever comes first.
 * With no last service on record, the clock starts at `today` and at the current reading.
 */
export function serviceDue(rule: ServiceRule, currentKm: number | null | undefined, today: Date = new Date()): ServiceDue {
  const everyDays = rule.everyDays && rule.everyDays > 0 ? rule.everyDays : null;
  const everyKm = rule.everyKm && rule.everyKm > 0 ? rule.everyKm : null;
  if (!everyDays && !everyKm) return { dueAt: null, dueKm: null, state: "unset", reason: "No interval set", daysLeft: null, kmLeft: null };

  let dueAt: Date | null = null, daysLeft: number | null = null;
  if (everyDays) {
    const from = rule.lastDoneAt ? new Date(rule.lastDoneAt) : today;
    dueAt = new Date(from.getTime() + everyDays * DAY);
    daysLeft = daysUntil(dueAt, today);
  }
  let dueKm: number | null = null, kmLeft: number | null = null;
  if (everyKm) {
    const base = rule.lastDoneKm ?? currentKm ?? 0;
    dueKm = base + everyKm;
    kmLeft = currentKm == null ? null : dueKm - currentKm;
  }

  const overdueByDate = daysLeft != null && daysLeft < 0;
  const overdueByKm = kmLeft != null && kmLeft < 0;
  const soonByDate = daysLeft != null && daysLeft <= SOON_DAYS;
  const soonByKm = kmLeft != null && everyKm != null && kmLeft <= soonKm(everyKm);

  let state: DueState = "ok";
  let reason = "";
  if (overdueByKm || overdueByDate) {
    state = "overdue";
    reason = overdueByKm ? `${Math.abs(kmLeft!).toLocaleString("en-GB")} km past due` : `${Math.abs(daysLeft!)} days late`;
  } else if (soonByKm || soonByDate) {
    state = "soon";
    reason = soonByKm ? `in ${kmLeft!.toLocaleString("en-GB")} km` : daysLeft === 0 ? "due today" : `in ${daysLeft} days`;
  } else {
    const parts: string[] = [];
    if (kmLeft != null) parts.push(`in ${kmLeft.toLocaleString("en-GB")} km`);
    if (dueAt) parts.push(dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }));
    reason = parts.join(" or ");
  }
  return { dueAt, dueKm, state, reason, daysLeft, kmLeft };
}

/** The days-before marks an expiry is announced on. */
export const DEFAULT_THRESHOLDS = [30, 14, 7, 1, 0];

/** True on a threshold day, false between them, "overdue" once passed. */
export function alertThresholdHit(days: number, thresholds: number[] = DEFAULT_THRESHOLDS): boolean | "overdue" {
  if (days < 0) return "overdue";
  return thresholds.includes(days);
}

/** "in 6 days", "today", "3 days ago". */
export function daysWords(days: number | null): string {
  if (days == null) return "not set";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
