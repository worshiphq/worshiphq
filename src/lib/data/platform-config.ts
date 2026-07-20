import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { plans as defaultPlans } from "@/config/pricing";
import {
  DEFAULT_PLAN_TABLE, PLAN_IDS,
  type PlanId, type PlanTable,
} from "@/lib/plan-gate";

export interface PlanPrices {
  [planId: string]: { monthly: number; yearly: number };
}

/** A fully editable plan, as stored in PlatformConfig.planDefs. */
export interface EditablePlan {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  /** Shown on the pricing card, e.g. "Up to 250 members". */
  membersLabel: string;
  /** Hard limit used for enforcement. -1 means unlimited. */
  memberLimit: number;
  /** Team seats. -1 means unlimited. */
  teamUsers: number;
  featured: boolean;
  cta: string;
  /** Bullet list shown on marketing / sign-up cards. */
  marketingFeatures: string[];
  /** Feature keys this plan unlocks — drives gating everywhere. */
  features: string[];
}

const DEFAULT_PRICES: PlanPrices = Object.fromEntries(
  defaultPlans.map((p) => [p.id, { monthly: p.monthly, yearly: p.yearly }]),
);

const UNLIMITED = -1;
const toStored = (n: number) => (Number.isFinite(n) ? n : UNLIMITED);
const toRuntime = (n: number) => (n < 0 ? Infinity : n);

/** Code defaults, assembled from src/config/pricing.ts + the built-in plan table. */
function codeDefaults(): Record<PlanId, EditablePlan> {
  const out = {} as Record<PlanId, EditablePlan>;
  for (const id of PLAN_IDS) {
    const p = defaultPlans.find((x) => x.id === id);
    const limits = DEFAULT_PLAN_TABLE[id];
    out[id] = {
      id,
      name: p?.name ?? id,
      tagline: p?.tagline ?? "",
      monthly: p?.monthly ?? 0,
      yearly: p?.yearly ?? 0,
      membersLabel: p?.members ?? "",
      memberLimit: toStored(limits.members),
      teamUsers: toStored(limits.teamUsers),
      featured: Boolean(p?.featured),
      cta: p?.cta ?? "Choose plan",
      marketingFeatures: [...(p?.features ?? [])],
      features: [...limits.features],
    };
  }
  return out;
}

/** Merge whatever the SuperAdmin saved over the code defaults, field by field,
 *  so a partial or older record can never blank out a plan. */
function resolvePlans(
  stored: unknown,
  prices: PlanPrices,
): Record<PlanId, EditablePlan> {
  const base = codeDefaults();
  const saved = (stored && typeof stored === "object" ? stored : {}) as Record<string, Partial<EditablePlan>>;

  for (const id of PLAN_IDS) {
    const s = saved[id];
    if (s && typeof s === "object") {
      base[id] = {
        ...base[id],
        ...(typeof s.name === "string" ? { name: s.name } : {}),
        ...(typeof s.tagline === "string" ? { tagline: s.tagline } : {}),
        ...(typeof s.membersLabel === "string" ? { membersLabel: s.membersLabel } : {}),
        ...(typeof s.memberLimit === "number" ? { memberLimit: s.memberLimit } : {}),
        ...(typeof s.teamUsers === "number" ? { teamUsers: s.teamUsers } : {}),
        ...(typeof s.featured === "boolean" ? { featured: s.featured } : {}),
        ...(typeof s.cta === "string" ? { cta: s.cta } : {}),
        ...(Array.isArray(s.marketingFeatures) ? { marketingFeatures: s.marketingFeatures.filter((f) => typeof f === "string") } : {}),
        ...(Array.isArray(s.features) ? { features: s.features.filter((f) => typeof f === "string") } : {}),
      };
    }
    // Prices stay in planPrices (single source of truth for billing).
    const pr = prices[id];
    if (pr) {
      base[id].monthly = pr.monthly;
      base[id].yearly = pr.yearly;
    }
  }
  return base;
}

export const getPlatformConfig = cache(async () => {
  const config = await db.platformConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currency: "USD", currencySymbol: "$", planPrices: DEFAULT_PRICES },
  });

  const prices = (config.planPrices as PlanPrices) ?? DEFAULT_PRICES;
  const planDefs = resolvePlans(config.planDefs, prices);

  // Runtime gating table — what every feature check across the app reads.
  const planTable = PLAN_IDS.reduce((acc, id) => {
    acc[id] = {
      members: toRuntime(planDefs[id].memberLimit),
      teamUsers: toRuntime(planDefs[id].teamUsers),
      features: planDefs[id].features,
    };
    return acc;
  }, {} as PlanTable);

  return {
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    prices,
    /** GHS charged per 1 unit of display currency at Paystack checkout. */
    usdToGhsRate: config.usdToGhsRate ?? 12.0,
    /** Full editable plan definitions (marketing + limits + features). */
    planDefs,
    /** Ordered list, handy for rendering pricing tables. */
    planList: PLAN_IDS.map((id) => planDefs[id]),
    /** Feature-gating table resolved from the database. */
    planTable,
  };
});

export type PlatformConfig = Awaited<ReturnType<typeof getPlatformConfig>>;
