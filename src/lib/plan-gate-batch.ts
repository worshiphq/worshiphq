import "server-only";
import { db } from "@/lib/db";
import { ttlCached } from "@/lib/ttl-cache";
import { commsTrial, planHasFeature, effectivePlan, paidPlan } from "@/lib/plan-gate";
import { trialFeatureSplit, type TrialStep } from "@/lib/trial-settings";

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

  // One cron run asks this about ten times, once per runner. Everyone's plan is read once and shared for a short
  // while instead of once per runner. A run is minutes long at most, so a 60 second wait on a plan change is harmless.
  const [allSubs, config, allCreated] = await Promise.all([
    ttlCached("plan-gate-batch:subs", 60_000, () => db.subscription.findMany({ select: { churchId: true, plan: true, status: true, renewsAt: true, trialPlan: true, trialEndsAt: true } })),
    import("@/lib/data/platform-config").then((m) => m.getPlatformConfig()),
    feature === "sms"
      ? ttlCached("plan-gate-batch:created", 60_000, () => db.church.findMany({ select: { id: true, createdAt: true } }))
      : Promise.resolve([] as { id: string; createdAt: Date }[]),
  ]);
  const wanted = new Set(ids);
  const subs = allSubs.filter((s) => wanted.has(s.churchId));
  const created = allCreated.filter((c) => wanted.has(c.id));

  const planOf = new Map(subs.map((s) => [s.churchId, effectivePlan(s)]));
  // Churches on a trial that holds this feature back do not get it from the trial.
  const heldBack = new Set(
    subs.filter((s) => {
      const trial = s.trialPlan as TrialStep | null;
      if (!trial || !s.trialEndsAt || s.trialEndsAt.getTime() <= Date.now() || effectivePlan(s) !== trial) return false;
      return trialFeatureSplit(config.planTable, paidPlan(s), trial, config.trials.hold[trial]).withheld.includes(feature);
    }).map((s) => s.churchId),
  );
  const createdOf = new Map(created.map((c) => [c.id, c.createdAt]));

  const allowed = churches.filter((c) => {
    const plan = planOf.get(c.id) ?? "free";
    if (planHasFeature(plan, feature, config.planTable) && !heldBack.has(c.id)) return true;
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
