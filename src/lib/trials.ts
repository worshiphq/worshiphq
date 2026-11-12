import "server-only";
import { db } from "@/lib/db";
import { getPlatformConfig, invalidatePlatformConfig } from "@/lib/data/platform-config";
import { getChurchSub } from "@/lib/plan-gate-server";
import { paidPlan } from "@/lib/plan-gate";
import { trialInfo, nextPlanUp, trialFeatureSplit, trialOffered, MAX_TRIAL_DAYS, COMMS_TRIAL_MAX_DAYS, type TrialAccess, type TrialInfo, type TrialStep, type TrialSettings } from "@/lib/trial-settings";

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

/** The facts that decide whether a church is offered a trial: invited, how many members, how long on the site. */
export async function getTrialAccess_(churchId: string, invitedAt: Date | null | undefined): Promise<TrialAccess> {
  const [church, members] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { createdAt: true } }),
    db.person.count({ where: { churchId, status: { not: "visitor" } } }),
  ]);
  const ageDays = church ? Math.floor((Date.now() - church.createdAt.getTime()) / 86_400_000) : 0;
  return { invited: !!invitedAt, members, ageDays };
}

/**
 * Where a church stands with trials, INCLUDING whether it is offered one (invited, or past the automatic rule). Only the
 * billing screen and starting a trial need this: it counts members, so the menu banner uses getChurchTrial instead.
 */
export async function getTrialOffer(churchId: string): Promise<TrialInfo & { settings: TrialSettings; access: TrialAccess }> {
  const [sub, cfg] = await Promise.all([getChurchSub(churchId), getPlatformConfig()]);
  const paid = paidPlan(sub);
  const base = trialInfo(sub, paid, cfg.trials);
  // Only look up the access facts when a trial could otherwise be started.
  const access = base.canStart ? await getTrialAccess_(churchId, sub?.trialInvitedAt) : { invited: !!sub?.trialInvitedAt, members: 0, ageDays: 0 };
  return { ...trialInfo(sub, paid, cfg.trials, new Date(), access), settings: cfg.trials, access };
}

export type TrialResult = { ok: true; plan: TrialStep; endsAt: string } | { ok: false; error: string };

/**
 * Start a trial of the next plan up. A church starting its own is held to the rules (switched on, one trial per plan, not
 * while one is running). SuperAdmin can pass `force` to give one anyway, and `days` to choose the length.
 */
export async function startTrial(churchId: string, opts: { force?: boolean; days?: number } = {}): Promise<TrialResult> {
  const [sub, cfg] = await Promise.all([
    db.subscription.findUnique({ where: { churchId }, select: { plan: true, status: true, renewsAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, trialsUsed: true, trialInvitedAt: true } }),
    getPlatformConfig(),
  ]);
  const paid = paidPlan(sub);
  // A church starting its own must be offered one (invited, or passing the automatic rule). SuperAdmin (force) is not held to it.
  const access = opts.force ? undefined : await getTrialAccess_(churchId, sub?.trialInvitedAt);
  const info = trialInfo(sub, paid, cfg.trials, new Date(), access);
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

/** Invite churches to start a trial themselves (they then see the Start button). */
export async function inviteToTrial(churchIds: string[]): Promise<number> {
  let n = 0;
  for (const churchId of churchIds) {
    await db.subscription.upsert({ where: { churchId }, update: { trialInvitedAt: new Date() }, create: { churchId, plan: "free", interval: "monthly", status: "active", trialInvitedAt: new Date() } });
    n++;
  }
  return n;
}

export async function uninviteFromTrial(churchIds: string[]): Promise<number> {
  const r = await db.subscription.updateMany({ where: { churchId: { in: churchIds } }, data: { trialInvitedAt: null } });
  return r.count;
}

/** Switch on the free Communications trial (up to 14 days) for a church (SuperAdmin). */
export async function grantCommsMonth(churchId: string, days?: number): Promise<{ ok: true; endsAt: string } | { ok: false; error: string }> {
  const cfg = await getPlatformConfig();
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { plan: true } });
  if (sub && sub.plan !== "free") return { ok: false, error: "Paid plans already include Communications." };
  const d = Math.min(COMMS_TRIAL_MAX_DAYS, Math.max(1, Math.round(days ?? cfg.trials.comms.days)));
  const now = new Date();
  const endsAt = new Date(now.getTime() + d * DAY);
  await db.subscription.upsert({
    where: { churchId },
    update: { commsTrialStartedAt: now, commsTrialEndsAt: endsAt },
    create: { churchId, plan: "free", interval: "monthly", status: "active", commsTrialStartedAt: now, commsTrialEndsAt: endsAt },
  });
  return { ok: true, endsAt: endsAt.toISOString() };
}

/** End a church's free Communications trial now. */
export async function endCommsMonth(churchId: string): Promise<boolean> {
  const r = await db.subscription.updateMany({ where: { churchId, commsTrialEndsAt: { not: null } }, data: { commsTrialEndsAt: new Date(Date.now() - 1000) } });
  return r.count > 0;
}
