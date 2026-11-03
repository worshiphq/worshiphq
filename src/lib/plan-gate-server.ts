import "server-only";
import { db } from "@/lib/db";
import { cache } from "react";
import { effectivePlan, type PlanId } from "./plan-gate";

export const getChurchPlan = cache(async (churchId: string): Promise<PlanId> => {
  const sub = await db.subscription.findUnique({
    where: { churchId },
    select: { plan: true, status: true, renewsAt: true },
  });
  return effectivePlan(sub);
});
