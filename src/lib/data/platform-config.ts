import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { plans as defaultPlans } from "@/config/pricing";

export interface PlanPrices {
  [planId: string]: { monthly: number; yearly: number };
}

const DEFAULT_PRICES: PlanPrices = Object.fromEntries(
  defaultPlans.map((p) => [p.id, { monthly: p.monthly, yearly: p.yearly }]),
);

export const getPlatformConfig = cache(async () => {
  const config = await db.platformConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", currency: "GHS", currencySymbol: "₵", planPrices: DEFAULT_PRICES },
  });
  const prices = (config.planPrices as PlanPrices) ?? DEFAULT_PRICES;
  return {
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    prices,
  };
});
