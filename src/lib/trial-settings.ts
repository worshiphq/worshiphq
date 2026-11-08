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
  /** Features each trial holds back: they stay locked during that trial, and only come with the paid plan. */
  hold: Record<TrialStep, string[]>;
  /** A church that passes this on its own may start a trial without being invited. */
  auto: { enabled: boolean; minMembers: number; minDays: number };
  /** The free month of Communications. Off = nobody has it (even if switched on for them). Days = the usual length. */
  comms: { enabled: boolean; days: number };
}

export const DEFAULT_TRIAL_SETTINGS: TrialSettings = { enabled: true, days: 7, steps: { starter: true, pro: true, max: true }, hold: { starter: [], pro: [], max: [] },
  auto: { enabled: true, minMembers: 20, minDays: 14 }, comms: { enabled: true, days: 30 } };

export const MAX_TRIAL_DAYS = 30;

/** Whatever is saved, turned into safe settings (a missing or odd value falls back to the default). */
export function normalizeTrialSettings(raw: unknown): TrialSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TrialSettings> & { steps?: Partial<Record<TrialStep, unknown>>; hold?: Partial<Record<TrialStep, unknown>>; auto?: Partial<TrialSettings["auto"]>; comms?: Partial<TrialSettings["comms"]> };
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))].slice(0, 200) : []);
  const days = Number(r.days);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_TRIAL_SETTINGS.enabled,
    days: Number.isFinite(days) && days >= 1 ? Math.min(MAX_TRIAL_DAYS, Math.round(days)) : DEFAULT_TRIAL_SETTINGS.days,
    steps: {
      starter: typeof r.steps?.starter === "boolean" ? r.steps.starter : true,
      pro: typeof r.steps?.pro === "boolean" ? r.steps.pro : true,
      max: typeof r.steps?.max === "boolean" ? r.steps.max : true,
    },
    hold: { starter: list(r.hold?.starter), pro: list(r.hold?.pro), max: list(r.hold?.max) },
    auto: {
      enabled: typeof r.auto?.enabled === "boolean" ? r.auto.enabled : DEFAULT_TRIAL_SETTINGS.auto.enabled,
      minMembers: Number.isFinite(Number(r.auto?.minMembers)) && Number(r.auto?.minMembers) >= 0 ? Math.min(100000, Math.round(Number(r.auto?.minMembers))) : DEFAULT_TRIAL_SETTINGS.auto.minMembers,
      minDays: Number.isFinite(Number(r.auto?.minDays)) && Number(r.auto?.minDays) >= 0 ? Math.min(3650, Math.round(Number(r.auto?.minDays))) : DEFAULT_TRIAL_SETTINGS.auto.minDays,
    },
    comms: {
      enabled: typeof r.comms?.enabled === "boolean" ? r.comms.enabled : DEFAULT_TRIAL_SETTINGS.comms.enabled,
      days: Number.isFinite(Number(r.comms?.days)) && Number(r.comms?.days) >= 1 ? Math.min(MAX_TRIAL_DAYS, Math.round(Number(r.comms?.days))) : DEFAULT_TRIAL_SETTINGS.comms.days,
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
/** What decides whether a church is OFFERED a trial: an invitation, or passing the automatic rule. */
export interface TrialAccess { invited: boolean; members: number; ageDays: number }

/** Is the church allowed to start a trial itself right now (invited, or it passes the automatic rule)? */
export function trialOffered(access: TrialAccess, settings: TrialSettings): boolean {
  return access.invited || (settings.auto.enabled && access.members >= settings.auto.minMembers && access.ageDays >= settings.auto.minDays);
}

export function trialInfo(sub: TrialSub | null | undefined, paid: PlanId, settings: TrialSettings, now: Date = new Date(), access?: TrialAccess): TrialInfo {
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
  else if (access && !trialOffered(access, settings)) blockedReason = "Not invited yet.";
  else canStart = target;

  return { phase, plan: trialPlan, endsAt: endsAt?.toISOString() ?? null, daysLeft, canStart, blockedReason };
}

/**
 * What a running trial adds on top of the paid plan, split into what the church can use now (`usable`) and what the trial
 * holds back (`withheld`, set by SuperAdmin). `table` is the plan table: plan id -> { features }.
 */
export function trialFeatureSplit(
  table: Record<string, { features: string[] }>,
  paid: PlanId,
  trialPlan: TrialStep,
  hold: string[],
): { usable: string[]; withheld: string[] } {
  const have = new Set(table[paid]?.features ?? []);
  const added = (table[trialPlan]?.features ?? []).filter((f) => !have.has(f));
  const held = new Set(hold);
  return { usable: added.filter((f) => !held.has(f)), withheld: added.filter((f) => held.has(f)) };
}
