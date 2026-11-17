/**
 * Staff & Payroll: validation, rule freezing, the run status machine and the maker-checker rule. PURE (tsx-testable).
 */
import { z } from "zod";
import type { Band, PayrollRules } from "./calc";
import { DEFAULT_PAYROLL_RULES } from "./defaults";

const twoDp = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
const pctField = z.coerce.number().min(0).max(100).refine(twoDp, "Use at most 2 decimal places.");

export const BandsSchema = z
  .array(z.object({ width: z.number().positive().nullable(), pct: z.number().min(0).max(100).refine(twoDp, "Use at most 2 decimal places.") }))
  .min(1, "Add at least one band.")
  .max(20)
  .superRefine((bands, ctx) => {
    bands.forEach((b, i) => {
      const last = i === bands.length - 1;
      if (last && b.width !== null) ctx.addIssue({ code: "custom", message: "The last band must be open (no width)." });
      if (!last && b.width === null) ctx.addIssue({ code: "custom", message: "Only the last band can be open." });
      if (b.width !== null && !twoDp(b.width)) ctx.addIssue({ code: "custom", message: "Band widths use at most 2 decimal places." });
    });
  });

export const SettingsSchema = z.object({
  statutoryMode: z.enum(["ghana", "none"]),
  ssnitEmployeePct: pctField,
  ssnitEmployerPct: pctField,
  tier1Pct: pctField,
  tier2Pct: pctField,
  ssnitMonthlyCap: z.union([z.literal(""), z.coerce.number().positive().max(10_000_000)]).optional(),
  workingDaysRule: z.enum(["weekdays", "fixed"]),
  fixedWorkingDays: z.coerce.number().int().min(1).max(31),
  postingMode: z.enum(["split", "together"]),
  salaryCategory: z.string().trim().min(1).max(80),
  ssnitCategory: z.string().trim().min(1).max(80),
  payeCategory: z.string().trim().min(1).max(80),
  deductionsCategory: z.string().trim().min(1).max(80),
  loansCategory: z.string().trim().min(1).max(80),
  makerChecker: z.enum(["auto", "always"]),
  payslipNote: z.string().trim().max(400).optional(),
  staffNoPrefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only."),
  employerSsnitNo: z.string().trim().max(40).optional(),
  employerTin: z.string().trim().max(40).optional(),
  bonusTaxMode: z.enum(["normal", "ghana"]),
  bonusRatePct: pctField,
  bonusCapPct: pctField,
  overtimeTaxMode: z.enum(["normal", "ghana"]),
  overtimeLowPct: pctField,
  overtimeHighPct: pctField,
  overtimeQualifyMax: z.union([z.literal(""), z.coerce.number().positive().max(10_000_000)]).optional(),
}).refine((v) => Math.abs(v.ssnitEmployeePct + v.ssnitEmployerPct - (v.tier1Pct + v.tier2Pct)) < 1e-6, {
  message: "Tier 1 and Tier 2 must add up to the employee and employer SSNIT rates together.",
  path: ["tier1Pct"],
});

/** The band set for a run month: the latest effectiveFrom on or before the 1st of the month. */
export function pickBandSet<T extends { effectiveFrom: Date | string }>(sets: T[], year: number, month: number): T | null {
  const first = Date.UTC(year, month - 1, 1);
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const s of sets) {
    const at = new Date(s.effectiveFrom).getTime();
    if (at <= first + 12 * 3600 * 1000 && at > bestAt) { best = s; bestAt = at; }
  }
  return best;
}

type NumLike = number | string | { toString(): string } | null | undefined;
const num = (v: NumLike, fallback: number) => (v === null || v === undefined || v === "" ? fallback : Number(v.toString()));

/** Settings + band set to the frozen rules stored on PayrollRun.rules. */
export function freezeRules(
  settings: {
    statutoryMode?: string; ssnitEmployeePct?: NumLike; ssnitEmployerPct?: NumLike; tier1Pct?: NumLike; tier2Pct?: NumLike; ssnitMonthlyCap?: NumLike;
    bonusTaxMode?: string; bonusRatePct?: NumLike; bonusCapPct?: NumLike; overtimeTaxMode?: string; overtimeLowPct?: NumLike; overtimeHighPct?: NumLike; overtimeQualifyMax?: NumLike;
  } | null,
  set: { name: string; effectiveFrom: Date | string; bands: unknown } | null,
): PayrollRules {
  const d = DEFAULT_PAYROLL_RULES;
  const parsed = set ? BandsSchema.safeParse(set.bands) : null;
  const cap = settings?.ssnitMonthlyCap;
  const otMax = settings?.overtimeQualifyMax;
  return {
    statutoryMode: settings?.statutoryMode === "none" ? "none" : "ghana",
    ssnitEePct: num(settings?.ssnitEmployeePct, d.ssnitEePct),
    ssnitErPct: num(settings?.ssnitEmployerPct, d.ssnitErPct),
    tier1Pct: num(settings?.tier1Pct, d.tier1Pct),
    tier2Pct: num(settings?.tier2Pct, d.tier2Pct),
    ssnitCap: cap === null || cap === undefined || cap === "" ? null : Number(cap.toString()),
    bands: parsed?.success ? (parsed.data as Band[]) : d.bands,
    bandSetName: parsed?.success && set ? set.name : d.bandSetName,
    effectiveFrom: parsed?.success && set ? new Date(set.effectiveFrom).toISOString().slice(0, 10) : d.effectiveFrom,
    bonusTaxMode: settings?.bonusTaxMode === "ghana" ? "ghana" : "normal",
    bonusRatePct: num(settings?.bonusRatePct, d.bonusRatePct!),
    bonusCapPct: num(settings?.bonusCapPct, d.bonusCapPct!),
    overtimeTaxMode: settings?.overtimeTaxMode === "ghana" ? "ghana" : "normal",
    overtimeLowPct: num(settings?.overtimeLowPct, d.overtimeLowPct!),
    overtimeHighPct: num(settings?.overtimeHighPct, d.overtimeHighPct!),
    overtimeQualifyMax: otMax === null || otMax === undefined || otMax === "" ? null : Number(otMax.toString()),
  };
}

/** Read frozen rules back from a run (tolerant of older shapes). */
export function rulesFromJson(json: unknown): PayrollRules {
  const r = (json && typeof json === "object" ? json : {}) as Partial<PayrollRules>;
  return { ...DEFAULT_PAYROLL_RULES, ...r, bands: Array.isArray(r.bands) && r.bands.length ? r.bands : DEFAULT_PAYROLL_RULES.bands };
}

export type RunStatus = "draft" | "review" | "approved" | "paid" | "reversed";
export type RunAction = "submit" | "sendBack" | "approve" | "pay" | "reverse" | "edit" | "delete";

const TRANSITIONS: Record<RunAction, { from: RunStatus[]; to: RunStatus | null }> = {
  edit: { from: ["draft"], to: null },
  delete: { from: ["draft"], to: null },
  submit: { from: ["draft"], to: "review" },
  sendBack: { from: ["review"], to: "draft" },
  approve: { from: ["review"], to: "approved" },
  pay: { from: ["approved"], to: "paid" },
  reverse: { from: ["paid"], to: "reversed" },
};

/** The status after an action, or null when the action is not allowed from this status. */
export function nextStatus(current: string, action: RunAction): RunStatus | null {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current as RunStatus)) return null;
  return t.to ?? (current as RunStatus);
}

export interface ApproveCheck {
  run: { status: string; preparedById: string | null; submittedById: string | null; lastEditedById: string | null };
  actorId: string;
  /** User ids who hold payroll manage (the Main Admin included). */
  eligibleManagers: string[];
  mode: "auto" | "always";
  /** The actor has a pay line in this run that they edited themselves. */
  actorEditedOwnLine?: boolean;
}

/**
 * Maker-checker. With more than one payroll manager (or "always"), the approver must not be the person who prepared,
 * sent or last edited the run, nor someone whose own line in it they edited. A lone manager under "auto" may approve
 * their own run, which is recorded as self-approved and shown with a badge.
 */
export function canApprove(c: ApproveCheck): { ok: true; selfApproved: boolean } | { ok: false; reason: string } {
  if (c.run.status !== "review") return { ok: false, reason: "Only a payroll that is waiting for approval can be approved." };
  if (!c.eligibleManagers.includes(c.actorId)) return { ok: false, reason: "Only a payroll manager can approve." };
  const involved = [c.run.preparedById, c.run.submittedById, c.run.lastEditedById].includes(c.actorId);
  const strict = c.mode === "always" || c.eligibleManagers.length > 1 || !!c.actorEditedOwnLine;
  if (c.actorEditedOwnLine && c.eligibleManagers.length > 1) {
    return { ok: false, reason: "You changed your own pay in this payroll. Another payroll manager must approve it." };
  }
  if (strict && involved) {
    if (c.eligibleManagers.length <= 1) {
      return { ok: false, reason: c.actorEditedOwnLine
        ? "You changed your own pay in this payroll. Add a second payroll manager in Settings, Team to approve it."
        : "Your approval rule needs a second person. Add another payroll manager in Settings, Team." };
    }
    return { ok: false, reason: "You prepared this payroll. Another payroll manager must approve it." };
  }
  return { ok: true, selfApproved: involved };
}

/** Basic validation of a YYYY-MM period string. */
export function isPeriod(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}
