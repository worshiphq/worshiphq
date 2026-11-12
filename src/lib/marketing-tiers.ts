import { PLAN_IDS, ALL_FEATURES, membersText, type PlanId, type PlanTable } from "@/lib/plan-gate";
import { lowerFirst } from "@/lib/utils";

/**
 * For the public pages: the lowest plan each feature is on, and each plan's member limit, read from the plan settings
 * in SuperAdmin. The pages never promise a feature on a plan that does not have it.
 */
export function marketingTiers(planTable: PlanTable): { tiers: Record<string, PlanId>; members: Record<PlanId, string> } {
  const tiers: Record<string, PlanId> = {};
  for (const f of ALL_FEATURES) {
    const p = PLAN_IDS.find((id) => planTable[id]?.features.includes(f));
    if (p) tiers[f] = p;
  }
  const members = Object.fromEntries(PLAN_IDS.map((id) => [id, lowerFirst(membersText(planTable[id]?.members ?? 0))])) as Record<PlanId, string>;
  return { tiers, members };
}
