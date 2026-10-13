// Client-safe helpers for roster personal-duty reminders (the "your duty is
// tomorrow" text). A reminder can be set for the church in general, for one
// roster sheet, or for a single service on a sheet - the most specific wins.

import { WEEKDAY_LABELS } from "@/lib/automations/weekdays";

export type RemindMode = "off" | "relative" | "weekday";

/** A sheet's or service's own reminder timing. null/absent = follow the next level up. */
export type RemindOverride = {
  mode: RemindMode;
  /** relative: days before the service (0 = the same day). */
  leadDays?: number;
  /** weekday: 0=Sun..6=Sat, sent on that weekday for services in the coming week. */
  weekday?: number;
  hour?: number;
  minute?: number;
};

export type ChurchRemind = { on: boolean; leadDays: number; hour: number; minute: number; weekday: number | null };

/** What a slot will actually do once its service, sheet and the church are considered. */
export type EffectiveRemind =
  | { mode: "off" }
  | { mode: "relative"; leadDays: number; hour: number; minute: number }
  | { mode: "weekday"; weekday: number; hour: number; minute: number };

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Clean whatever was stored (or submitted) into a valid override, or null. */
export function parseRemindOverride(raw: unknown): RemindOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.mode === "off") return { mode: "off" };
  if (r.mode === "relative") return { mode: "relative", leadDays: clamp(r.leadDays, 0, 14, 1), hour: clamp(r.hour, 0, 23, 18), minute: clamp(r.minute, 0, 59, 0) };
  if (r.mode === "weekday") return { mode: "weekday", weekday: clamp(r.weekday, 0, 6, 1), hour: clamp(r.hour, 0, 23, 18), minute: clamp(r.minute, 0, 59, 0) };
  return null;
}

const fromOverride = (o: RemindOverride, church: ChurchRemind): EffectiveRemind => {
  if (o.mode === "off") return { mode: "off" };
  if (o.mode === "weekday") return { mode: "weekday", weekday: o.weekday ?? 1, hour: o.hour ?? church.hour, minute: o.minute ?? church.minute };
  return { mode: "relative", leadDays: o.leadDays ?? 1, hour: o.hour ?? church.hour, minute: o.minute ?? church.minute };
};

/** service override → sheet override → church default (off when the church has reminders off). */
export function resolveRemind(
  service: RemindOverride | null | undefined,
  sheet: RemindOverride | null | undefined,
  church: ChurchRemind,
): EffectiveRemind {
  const own = service ?? sheet;
  if (own) return fromOverride(own, church);
  if (!church.on) return { mode: "off" };
  if (church.weekday != null) return { mode: "weekday", weekday: church.weekday, hour: church.hour, minute: church.minute };
  return { mode: "relative", leadDays: church.leadDays, hour: church.hour, minute: church.minute };
}

const t12 = (h: number, m: number) => {
  const ap = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${ap}`;
};

/** "the day before at 6:00 pm", "Tuesdays at 6:00 pm", "no reminder". */
export function describeRemind(r: EffectiveRemind): string {
  if (r.mode === "off") return "no reminder";
  if (r.mode === "weekday") return `${WEEKDAY_LABELS[r.weekday]}s at ${t12(r.hour, r.minute)}`;
  const when = r.leadDays === 0 ? "the same day" : r.leadDays === 1 ? "the day before" : `${r.leadDays} days before`;
  return `${when} at ${t12(r.hour, r.minute)}`;
}

/**
 * The concrete send moment for a service date ("YYYY-MM-DD"): "Tuesday 14 Oct at 6:00 pm".
 * For weekday mode it's the chosen weekday on or before the service in that week.
 */
export function sendLabelFor(r: EffectiveRemind, serviceYmd: string): string | null {
  if (r.mode === "off" || !/^\d{4}-\d{2}-\d{2}$/.test(serviceYmd)) return null;
  const d = new Date(`${serviceYmd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (r.mode === "relative") d.setUTCDate(d.getUTCDate() - r.leadDays);
  else {
    // The weekday in the 7 days up to (and including) the service day.
    const back = (d.getUTCDay() - r.weekday + 7) % 7;
    d.setUTCDate(d.getUTCDate() - back);
  }
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  return `${date} at ${t12(r.hour, r.minute)}`;
}
