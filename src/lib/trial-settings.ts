import { PLAN_IDS, planRank, type PlanId } from "@/lib/plan-gate";

/**
 * Free trials of the next plan up. A church on Free can try Starter, Starter can try Pro, Pro can try Max, once each,
 * for a few days. When the days run out the church drops back to what it pays for and has to upgrade to keep the extras.
 * Pure functions (no database) so the church pages, SuperAdmin and the messages all agree.
 */

export type TrialStep = "starter" | "pro" | "max";
export const TRIAL_STEPS: TrialStep[] = ["starter", "pro", "max"];

export interface TrialSettings {
  /** The master switch. Off = nobody can start a trial (running ones carry on to their end date). */
  enabled: boolean;
  /** How many days a trial lasts. */
  days: number;
  /** Which upgrades can be trialled. */
  steps: Record<TrialStep, boolean>;
}

export const DEFAULT_TRIAL_SETTINGS: TrialSettings = { enabled: true, days: 7, steps: { starter: true, pro: true, max: true } };

export const MAX_TRIAL_DAYS = 30;

/** Whatever is saved, turned into safe settings (a missing or odd value falls back to the default). */
export function normalizeTrialSettings(raw: unknown): TrialSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TrialSettings> & { steps?: Partial<Record<TrialStep, unknown>> };
  const days = Number(r.days);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_TRIAL_SETTINGS.enabled,
    days: Number.isFinite(days) && days >= 1 ? Math.min(MAX_TRIAL_DAYS, Math.round(days)) : DEFAULT_TRIAL_SETTINGS.days,
    steps: {
      starter: typeof r.steps?.starter === "boolean" ? r.steps.starter : true,
      pro: typeof r.steps?.pro === "boolean" ? r.steps.pro : true,
      max: typeof r.steps?.max === "boolean" ? r.steps.max : true,
    },
  };
}

/** The plan above this one, or null on the top plan. */
export function nextPlanUp(plan: PlanId): TrialStep | null {
  const i = PLAN_IDS.indexOf(plan);
  const next = PLAN_IDS[i + 1];
  return next && TRIAL_STEPS.includes(next as TrialStep) ? (next as TrialStep) : null;
}

export interface TrialSub {
  plan: string;
  status?: string | null;
  renewsAt?: Date | string | null;
  trialPlan?: string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  trialsUsed?: string[] | null;
}

export type TrialPhase = "none" | "active" | "ended" | "converted";

export interface TrialInfo {
  phase: TrialPhase;
  /** The plan being (or that was) trialled. */
  plan: TrialStep | null;
  endsAt: string | null;
  daysLeft: number;
  /** The plan the church can start a trial of right now, or null (and why). */
  canStart: TrialStep | null;
  blockedReason: string | null;
}

const asDate = (v: Date | string | null | undefined) => (v ? new Date(v) : null);

/**
 * Where a church stands with trials. `paid` is the plan it actually pays for (not the trial plan).
 * "ended": the trial ran out and the church did not move up to that plan. "converted": it did.
 */
export function trialInfo(sub: TrialSub | null | undefined, paid: PlanId, settings: TrialSettings, now: Date = new Date()): TrialInfo {
  const trialPlan = (sub?.trialPlan as TrialStep | null | undefined) ?? null;
  const endsAt = asDate(sub?.trialEndsAt);
  const used = sub?.trialsUsed ?? [];

  let phase: TrialPhase = "none";
  let daysLeft = 0;
  if (trialPlan && endsAt) {
    if (endsAt.getTime() > now.getTime()) {
      phase = "active";
      daysLeft = Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
    } else {
      phase = planRank(paid) >= planRank(trialPlan) ? "converted" : "ended";
    }
  }

  const target = nextPlanUp(paid);
  let canStart: TrialStep | null = null;
  let blockedReason: string | null = null;
  if (phase === "active") blockedReason = "A trial is already running.";
  else if (!target) blockedReason = "This church is already on the top plan.";
  else if (!settings.enabled) blockedReason = "Trials are switched off.";
  else if (!settings.steps[target]) blockedReason = `Trials of ${target} are switched off.`;
  else if (used.includes(target)) blockedReason = `This church has already tried ${target}.`;
  else canStart = target;

  return { phase, plan: trialPlan, endsAt: endsAt?.toISOString() ?? null, daysLeft, canStart, blockedReason };
}
