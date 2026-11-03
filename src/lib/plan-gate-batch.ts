import "server-only";
import { db } from "@/lib/db";
import { commsTrial, planHasFeature, type PlanId } from "@/lib/plan-gate";

/**
 * Plan gating for the scheduled jobs.
 *
 * A page being locked on a church's plan does not stop a timer. Every scheduled runner (birthday
 * texts, roster reminders, we-miss-you texts, follow-up digests...) loops over every church, and
 * until now none of them asked "does this church's plan include this?". A church that downgraded kept
 * receiving everything it had switched on while it was paid up, at the platform's expense.
 *
 * `onlyWithFeature` takes the list of churches a runner was about to process and returns only the ones
 * whose current plan includes `feature`. It reads every church's plan in two queries (not one per
 * church), so a runner with hundreds of churches pays almost nothing for it.
 *
 * A church with no subscription row is on Free. A gifted plan (status "grace") counts as the plan it
 * carries, the same as everywhere else. A church still inside its free month of Communications keeps
 * `sms`, because that month is a promise made at signup.
 */
export async function onlyWithFeature<T extends { id: string }>(churches: T[], feature: string): Promise<T[]> {
  if (churches.length === 0) return churches;
  const ids = churches.map((c) => c.id);

  const [subs, config, created] = await Promise.all([
    db.subscription.findMany({ where: { churchId: { in: ids } }, select: { churchId: true, plan: true } }),
    import("@/lib/data/platform-config").then((m) => m.getPlatformConfig()),
    feature === "sms"
      ? db.church.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } })
      : Promise.resolve([] as { id: string; createdAt: Date }[]),
  ]);

  const planOf = new Map(subs.map((s) => [s.churchId, (s.plan as PlanId) || "free"]));
  const createdOf = new Map(created.map((c) => [c.id, c.createdAt]));

  const allowed = churches.filter((c) => {
    const plan = planOf.get(c.id) ?? "free";
    if (planHasFeature(plan, feature, config.planTable)) return true;
    if (feature === "sms" && plan === "free") {
      const at = createdOf.get(c.id);
      return !!at && commsTrial(at).active;
    }
    return false;
  });

  if (allowed.length < churches.length) {
    console.info(`[plan-gate] ${feature}: skipped ${churches.length - allowed.length} of ${churches.length} churches whose plan does not include it`);
  }
  return allowed;
}
