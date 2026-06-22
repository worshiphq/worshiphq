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
  let config = await db.platformConfig.findUnique({ where: { id: "default" } });
  if (!config) {
    config = await db.platformConfig.create({
      data: { id: "default", currency: "GHS", currencySymbol: "₵", planPrices: DEFAULT_PRICES },
    });
  }
  const prices = (config.planPrices as PlanPrices) ?? DEFAULT_PRICES;
  return {
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    prices,
  };
});
