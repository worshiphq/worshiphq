import "server-only";
import { db } from "@/lib/db";
import { getPlatformConfig, invalidatePlatformConfig } from "@/lib/data/platform-config";
import { getChurchSub } from "@/lib/plan-gate-server";
import { paidPlan } from "@/lib/plan-gate";
import { trialInfo, nextPlanUp, trialFeatureSplit, MAX_TRIAL_DAYS, type TrialInfo, type TrialStep, type TrialSettings } from "@/lib/trial-settings";

const DAY = 86_400_000;

/** Where a church stands with trials, as the church pages show it. */
export async function getChurchTrial(churchId: string): Promise<TrialInfo & { settings: TrialSettings }> {
  const [sub, cfg] = await Promise.all([getChurchSub(churchId), getPlatformConfig()]);
  return { ...trialInfo(sub, paidPlan(sub), cfg.trials), settings: cfg.trials };
}

/**
 * What a running trial gives this church: the features it can use only because of the trial (`usable`) and the ones the
 * trial holds back (`withheld`, chosen by SuperAdmin). Both are empty when no trial is running.
 */
export async function getTrialAccess(churchId: string): Promise<{ plan: TrialStep | null; startedAt: string | null; endsAt: string | null; daysLeft: number; usable: string[]; withheld: string[] }> {
  const [sub, cfg] = await Promise.all([getChurchSub(churchId), getPlatformConfig()]);
  const paid = paidPlan(sub);
  const info = trialInfo(sub, paid, cfg.trials);
  if (info.phase !== "active" || !info.plan) return { plan: null, startedAt: null, endsAt: null, daysLeft: 0, usable: [], withheld: [] };
  const split = trialFeatureSplit(cfg.planTable, paid, info.plan, cfg.trials.hold[info.plan]);
  return { plan: info.plan, startedAt: sub?.trialStartedAt?.toISOString() ?? null, endsAt: info.endsAt, daysLeft: info.daysLeft, ...split };
}

export type TrialResult = { ok: true; plan: TrialStep; endsAt: string } | { ok: false; error: string };

/**
 * Start a trial of the next plan up. A church starting its own is held to the rules (switched on, one trial per plan, not
 * while one is running). SuperAdmin can pass `force` to give one anyway, and `days` to choose the length.
 */
export async function startTrial(churchId: string, opts: { force?: boolean; days?: number } = {}): Promise<TrialResult> {
  const [sub, cfg] = await Promise.all([
    db.subscription.findUnique({ where: { churchId }, select: { plan: true, status: true, renewsAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, trialsUsed: true } }),
    getPlatformConfig(),
  ]);
  const paid = paidPlan(sub);
  const info = trialInfo(sub, paid, cfg.trials);
  let target: TrialStep | null = info.canStart;
  if (!target && opts.force && info.phase !== "active") target = nextPlanUp(paid);
  if (!target) return { ok: false, error: info.blockedReason ?? "No trial is available." };

  const days = Math.min(MAX_TRIAL_DAYS, Math.max(1, Math.round(opts.days ?? cfg.trials.days)));
  const now = new Date();
  const endsAt = new Date(now.getTime() + days * DAY);
  const used = [...new Set([...(sub?.trialsUsed ?? []), target])];
  await db.subscription.upsert({
    where: { churchId },
    update: { trialPlan: target, trialStartedAt: now, trialEndsAt: endsAt, trialsUsed: used, trialNotified: [] },
    create: { churchId, plan: "free", interval: "monthly", status: "active", trialPlan: target, trialStartedAt: now, trialEndsAt: endsAt, trialsUsed: used, trialNotified: [] },
  });
  return { ok: true, plan: target, endsAt: endsAt.toISOString() };
}

/** Give a running trial more days (SuperAdmin). */
export async function extendTrial(churchId: string, extraDays: number): Promise<TrialResult> {
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { trialPlan: true, trialEndsAt: true } });
  if (!sub?.trialPlan || !sub.trialEndsAt) return { ok: false, error: "This church has no trial to extend." };
  const add = Math.min(MAX_TRIAL_DAYS, Math.max(1, Math.round(extraDays)));
  // From the end date if it is still running, otherwise from now (re-opening one that just ended).
  const from = Math.max(sub.trialEndsAt.getTime(), Date.now());
  const endsAt = new Date(from + add * DAY);
  await db.subscription.update({ where: { churchId }, data: { trialEndsAt: endsAt, trialNotified: [] } });
  return { ok: true, plan: sub.trialPlan as TrialStep, endsAt: endsAt.toISOString() };
}

/** End a trial now (SuperAdmin). The church drops back to what it pays for straight away. */
export async function endTrial(churchId: string): Promise<{ ok: boolean; error?: string }> {
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { trialPlan: true, trialEndsAt: true } });
  if (!sub?.trialPlan || !sub.trialEndsAt || sub.trialEndsAt.getTime() <= Date.now()) return { ok: false, error: "No trial is running for this church." };
  await db.subscription.update({ where: { churchId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
  return { ok: true };
}

export async function saveTrialSettings(next: TrialSettings): Promise<void> {
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { trialSettings: next as unknown as object },
    create: { id: "default", trialSettings: next as unknown as object },
  });
  invalidatePlatformConfig();
}

/**
 * Cancel a church's trial as if it had never been given: the trial and its notice go away, the plan it tried is taken off
 * its "already tried" list, and the church can start that trial itself again. For a trial started by mistake, or started
 * for them when you wanted them to start it themselves.
 */
export async function resetTrial(churchId: string): Promise<{ ok: boolean; error?: string }> {
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { trialPlan: true, trialsUsed: true } });
  if (!sub?.trialPlan) return { ok: false, error: "This church has no trial to reset." };
  await db.subscription.update({
    where: { churchId },
    data: { trialPlan: null, trialStartedAt: null, trialEndsAt: null, trialsUsed: sub.trialsUsed.filter((p) => p !== sub.trialPlan), trialNotified: [] },
  });
  return { ok: true };
}
