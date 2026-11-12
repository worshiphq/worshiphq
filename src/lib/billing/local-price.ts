/**
 * Fixed cedi prices for churches in Ghana.
 *
 * Everyone else sees dollars and pays the dollar price converted at the live rate. A church in Ghana sees
 * round cedi prices the SuperAdmin set (e.g. GHS 120 a month) and pays exactly that, so there is no
 * "$9.99 became GHS 117.43" surprise at checkout.
 *
 * Billing still runs in USD underneath (prorations, coupons, ledger). For a Ghana church the cedi amount
 * is worked out with that plan's own rate (cedi price / dollar price), so the full price comes out at the
 * exact cedi figure and a prorated or discounted amount stays in proportion.
 */
import type { PlanPrices } from "@/lib/data/platform-config";

type Cfg = { prices: PlanPrices; usdToGhsRate: number };
type Interval = "monthly" | "yearly";

export function isGhana(country?: string | null): boolean {
  return /^\s*(ghana|gh)\s*$/i.test(country ?? "");
}

/** The fixed cedi list price for a plan, or null when none is set. */
export function ghsListPrice(cfg: Cfg, plan: string, interval: Interval): number | null {
  const p = cfg.prices[plan];
  const v = Number(interval === "yearly" ? p?.ghsYearly : p?.ghsMonthly);
  return v > 0 ? v : null;
}

/** Cedis charged per dollar for this plan, for this church. */
export function chargeRate(cfg: Cfg, plan: string, interval: Interval, ghana: boolean): number {
  if (ghana) {
    const ghs = ghsListPrice(cfg, plan, interval);
    const p = cfg.prices[plan];
    const usd = Number(interval === "yearly" ? p?.yearly : p?.monthly);
    if (ghs && usd > 0) return ghs / usd;
  }
  return cfg.usdToGhsRate;
}

/** Whole cedis for a dollar amount at a given rate. */
export function toGhs(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

/** The prices a church should SEE: cedis for Ghana (fixed where set, converted otherwise), dollars for the rest. */
export function localPrices(cfg: Cfg, ghana: boolean): { currency: string; currencySymbol: string; prices: PlanPrices } | null {
  if (!ghana) return null;
  const prices: PlanPrices = {};
  for (const [id, p] of Object.entries(cfg.prices)) {
    prices[id] = {
      monthly: ghsListPrice(cfg, id, "monthly") ?? toGhs(p.monthly, cfg.usdToGhsRate),
      yearly: ghsListPrice(cfg, id, "yearly") ?? toGhs(p.yearly, cfg.usdToGhsRate),
    };
  }
  return { currency: "GHS", currencySymbol: "GHS ", prices };
}

export async function churchIsGhana(churchId: string): Promise<boolean> {
  const { db } = await import("@/lib/db");
  const c = await db.church.findUnique({ where: { id: churchId }, select: { country: true } });
  return isGhana(c?.country);
}
