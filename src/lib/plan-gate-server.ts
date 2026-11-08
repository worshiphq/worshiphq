import "server-only";
import { db } from "@/lib/db";
import { cache } from "react";
import { ALWAYS_ON_FEATURES, effectivePlan, planHasFeature, type PlanId } from "./plan-gate";
import { getPlatformConfig } from "@/lib/data/platform-config";

/** The church's subscription as the plan gate needs it, read once per request. */
export const getChurchSub = cache(async (churchId: string) => {
  return db.subscription.findUnique({
    where: { churchId },
    select: { plan: true, status: true, renewsAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, trialsUsed: true, trialInvitedAt: true, commsTrialEndsAt: true },
  });
});

/** The plan the church gets right now: what it pays for, or the next plan up while a free trial is running. */
export const getChurchPlan = cache(async (churchId: string): Promise<PlanId> => effectivePlan(await getChurchSub(churchId)));

/**
 * Does this church's plan include a feature? For screens nobody is signed in to, like a church's public visitor or
 * prayer form: signed-in pages are gated by their session instead. A feature the plan editor has unchecked for the
 * church's plan answers false, so the form stops working as well as the menu item.
 */
export async function churchHasFeature(churchId: string, feature: string): Promise<boolean> {
  if (ALWAYS_ON_FEATURES.includes(feature)) return true;
  const [plan, cfg] = await Promise.all([getChurchPlan(churchId), getPlatformConfig()]);
  if (!planHasFeature(plan, feature, cfg.planTable)) return false;
  // A running trial can hold this feature back.
  const { getTrialAccess } = await import("@/lib/trials");
  return !(await getTrialAccess(churchId)).withheld.includes(feature);
}
