import { PLAN_IDS, planRank, type PlanId } from "@/lib/plan-gate";

/**
 * Site-wide promotions, set in SuperAdmin › Pricing › Promotions. Each one runs on its own between its dates.
 *
 * - stepUp: every church uses the next plan up (Free → Starter, Starter → Pro, Pro → Max). Billing is unchanged:
 *   churches keep paying for their own plan.
 * - mediaFree: churches on a paid plan (or every church, with `everyone`) use WorshipHQ Live free until the end date.
 * - livePrices: what WorshipHQ Live costs in cedis, by the church's WorshipHQ plan ("free" = Free plan or none).
 * - mediaDiscount: a percentage off WorshipHQ Live, by the church's plan.
 *
 * Dates are whole days, from the start of `start` to the end of `end` (Ghana time = UTC). No end = until switched off.
 */
export interface Window { on: boolean; start: string; end: string | null }
export interface Promotions {
  /** WorshipHQ Live is closed to churches until this is switched on; testers (by email) can use it before. */
  launch: { on: boolean; testers: string[] };
  stepUp: Window;
  mediaFree: Window & { everyone: boolean };
  mediaDiscount: Window & { starter: number; pro: number; max: number };
  livePrices: LivePrices;
}

/** Cedis per month and per year, by WorshipHQ plan. */
export type LivePrices = Record<PlanId, { monthly: number; yearly: number }>;

export const DEFAULT_PROMOTIONS: Promotions = {
  launch: { on: false, testers: [] },
  stepUp: { on: false, start: "2026-12-01", end: "2026-12-31" },
  mediaFree: { on: false, start: "2026-12-01", end: "2026-12-31", everyone: true },
  mediaDiscount: { on: false, start: "2027-01-01", end: null, starter: 5, pro: 10, max: 15 },
  livePrices: {
    free: { monthly: 40, yearly: 400 },
    starter: { monthly: 30, yearly: 300 },
    pro: { monthly: 20, yearly: 200 },
    max: { monthly: 10, yearly: 100 },
  },
};

const ghs = (n: unknown, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : fallback;
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
  const l = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).launch : undefined) as Record<string, unknown> | undefined;
  return {
    launch: {
      on: l?.on === true,
      testers: Array.isArray(l?.testers)
        ? [...new Set((l!.testers as unknown[]).map((e) => String(e).trim().toLowerCase()).filter((e) => /^\S+@\S+\.\S+$/.test(e)))].slice(0, 100)
        : [],
    },
    stepUp: win(r.stepUp, d.stepUp),
    mediaFree: { ...win(r.mediaFree, d.mediaFree), everyone: r.mediaFree ? r.mediaFree.everyone === true : d.mediaFree.everyone },
    livePrices: Object.fromEntries(PLAN_IDS.map((id) => {
      const lp = (r.livePrices as Record<string, Record<string, unknown>> | undefined)?.[id];
      return [id, { monthly: ghs(lp?.monthly, d.livePrices[id].monthly), yearly: ghs(lp?.yearly, d.livePrices[id].yearly) }];
    })) as LivePrices,
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

/** May this person use WorshipHQ Live yet? Everyone once it is launched; before that, only the testers. */
export function liveOpenFor(p: Promotions, email: string | null | undefined): boolean {
  if (p.launch.on) return true;
  return !!email && p.launch.testers.includes(email.trim().toLowerCase());
}
