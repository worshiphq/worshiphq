import "server-only";
import { db } from "@/lib/db";
import { cache } from "react";
import type { PlanId } from "./plan-gate";

export const getChurchPlan = cache(async (churchId: string): Promise<PlanId> => {
  const sub = await db.subscription.findUnique({
    where: { churchId },
    select: { plan: true, status: true },
  });
  if (!sub) return "free";
  if (sub.status === "grace") return (sub.plan as PlanId) || "max";
  return (sub.plan as PlanId) || "free";
});
