/**
 * The next due date of a recurring expense. Works on UTC calendar dates.
 * Monthly, quarterly and yearly keep returning to the anchor day, so rent due on the 31st
 * is due on Feb 28 (or 29) and then on Mar 31 again, never drifting to the 28th for good.
 */

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";
export const FREQUENCIES: { key: Frequency; label: string }[] = [
  { key: "weekly", label: "Every week" },
  { key: "monthly", label: "Every month" },
  { key: "quarterly", label: "Every 3 months" },
  { key: "yearly", label: "Every year" },
];

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function advance(date: Date, frequency: string, anchorDay?: number | null): Date {
  if (frequency === "weekly") return new Date(date.getTime() + 7 * 86_400_000);
  const step = frequency === "yearly" ? 12 : frequency === "quarterly" ? 3 : 1;
  const anchor = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : date.getUTCDate();
  const total = date.getUTCMonth() + step;
  const y = date.getUTCFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const d = Math.min(anchor, daysInMonth(y, m));
  return new Date(Date.UTC(y, m, d, date.getUTCHours(), date.getUTCMinutes()));
}

export const frequencyLabel = (f: string) => FREQUENCIES.find((x) => x.key === f)?.label ?? f;
