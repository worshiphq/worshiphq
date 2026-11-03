import "server-only";
import { db } from "@/lib/db";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { getPlatformConfig } from "@/lib/data/platform-config";

/**
 * The plan's member limit, enforced. Everyone in People counts except visitors (they have their own list and never
 * use up a member place). A church already over its limit keeps everyone it has; it just cannot add more until it
 * upgrades or removes people.
 */
export async function memberRoom(churchId: string): Promise<{ limit: number | null; used: number; left: number }> {
  const plan = await getChurchPlan(churchId);
  const [cfg, used] = await Promise.all([getPlatformConfig(), countMembers(churchId, plan)]);
  const raw = cfg.planTable[plan]?.members;
  const limit = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
  return { limit, used, left: limit === null ? Infinity : Math.max(0, limit - used) };
}

/**
 * The number shown as "Members" on the billing page, and the number the limit is checked against.
 *
 * On the Free plan everyone counts, visitors included: a free church that keeps adding people as "visitors"
 * is still being carried by us, and the cap is what moves them onto a paid plan. On paid plans visitors are
 * free - they have their own list and never use up a member place.
 */
export function countMembers(churchId: string, plan?: string): Promise<number> {
  const countsVisitors = (plan ?? "free") === "free";
  return db.person.count({
    where: { churchId, ...(countsVisitors ? {} : { status: { not: "visitor" } }) },
  });
}

/** The sentence an admin sees when their plan is full. */
export function memberLimitMessage(limit: number): string {
  return `Your plan includes up to ${limit.toLocaleString("en-US")} members and you've reached it. Upgrade in Settings, Billing to add more, or remove people you no longer need.`;
}

/** Null when there is room for `adding` more members, otherwise the message to show. */
export async function memberLimitError(churchId: string, adding = 1): Promise<string | null> {
  const room = await memberRoom(churchId);
  if (room.limit === null || room.left >= adding) return null;
  return memberLimitMessage(room.limit);
}
