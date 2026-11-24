import { PLAN_IDS, planRank, type PlanId } from "@/lib/plan-gate";

/**
 * Site-wide promotions, set in SuperAdmin › Pricing › Promotions. Each one runs on its own between its dates.
 *
 * - stepUp: every church uses the next plan up (Free → Starter, Starter → Pro, Pro → Max). Billing is unchanged:
 *   churches keep paying for their own plan.
 * - mediaFree: churches on a paid plan can use WorshipHQ Live free (as a trial) until the end date.
 * - mediaDiscount: a percentage off WorshipHQ Live, by the church's plan.
 *
 * Dates are whole days, from the start of `start` to the end of `end` (Ghana time = UTC). No end = until switched off.
 */
export interface Window { on: boolean; start: string; end: string | null }
export interface Promotions {
  stepUp: Window;
  mediaFree: Window;
  mediaDiscount: Window & { starter: number; pro: number; max: number };
}

export const DEFAULT_PROMOTIONS: Promotions = {
  stepUp: { on: false, start: "2026-12-01", end: "2026-12-31" },
  mediaFree: { on: false, start: "2026-12-01", end: "2026-12-31" },
  mediaDiscount: { on: false, start: "2027-01-01", end: null, starter: 5, pro: 10, max: 15 },
};

const day = (s: unknown, fallback: string | null) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback);
const pct = (n: unknown, fallback: number) => Math.min(100, Math.max(0, Number.isFinite(Number(n)) ? Number(n) : fallback));

export function normalizePromotions(raw: unknown): Promotions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const win = (w: Record<string, unknown> | undefined, d: Window): Window => ({
    on: w?.on === true,
    start: day(w?.start, d.start)!,
    end: w && "end" in w ? day(w.end, null) : d.end,
  });
  const d = DEFAULT_PROMOTIONS;
  return {
    stepUp: win(r.stepUp, d.stepUp),
    mediaFree: win(r.mediaFree, d.mediaFree),
    mediaDiscount: {
      ...win(r.mediaDiscount, d.mediaDiscount),
      starter: pct(r.mediaDiscount?.starter, d.mediaDiscount.starter),
      pro: pct(r.mediaDiscount?.pro, d.mediaDiscount.pro),
      max: pct(r.mediaDiscount?.max, d.mediaDiscount.max),
    },
  };
}

/** The moment a window's last day ends. */
export function windowEnd(w: Window): Date | null {
  return w.end ? new Date(`${w.end}T23:59:59.999Z`) : null;
}

export function windowLive(w: Window, now = new Date()): boolean {
  if (!w.on) return false;
  if (now.getTime() < new Date(`${w.start}T00:00:00Z`).getTime()) return false;
  const end = windowEnd(w);
  return !end || now.getTime() <= end.getTime();
}

/** The plan a church gets with the step-up running (one plan higher, Max stays Max). */
export function withStepUp(plan: PlanId, p: Promotions, now = new Date()): PlanId {
  if (!windowLive(p.stepUp, now)) return plan;
  return PLAN_IDS[Math.min(PLAN_IDS.length - 1, planRank(plan) + 1)] ?? plan;
}

/** Percent off WorshipHQ Live for a church on this (paid-for) plan, right now. */
export function mediaDiscountPercent(plan: string, p: Promotions, now = new Date()): number {
  if (!windowLive(p.mediaDiscount, now)) return 0;
  return plan === "starter" ? p.mediaDiscount.starter : plan === "pro" ? p.mediaDiscount.pro : plan === "max" ? p.mediaDiscount.max : 0;
}
