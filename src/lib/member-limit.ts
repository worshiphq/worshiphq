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
  const [plan, cfg, used] = await Promise.all([
    getChurchPlan(churchId),
    getPlatformConfig(),
    countMembers(churchId),
  ]);
  const raw = cfg.planTable[plan]?.members;
  const limit = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
  return { limit, used, left: limit === null ? Infinity : Math.max(0, limit - used) };
}

/** The number shown as "Members" on the billing page, and the number the limit is checked against. */
export function countMembers(churchId: string): Promise<number> {
  return db.person.count({ where: { churchId, status: { not: "visitor" } } });
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
