"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete, assertPlanFeature, PlanLockedError, type Session } from "@/lib/auth";
import { audit, logAudit } from "@/lib/audit";
import { ownedId } from "@/lib/tenant";
import { ymdInTz, zonedToUtc } from "@/lib/time/tz";
import { levyAccess } from "@/lib/levies/guards";
import { computeLevy, validateRates, versionOn } from "@/lib/levies/calc";
import { explainLine, explainCap, PAYEE_KINDS, METHOD_LABELS } from "@/lib/levies/explain";
import { ZERO, toCents, fmtGhs, fmtRate, rateUnits, centsToNumber } from "@/lib/levies/money";
import { addDays, dayStart, longDate, nextPeriodStart, periodLabel, periodStartOf, clampMonth } from "@/lib/levies/periods";
import { allocateOldestFirst } from "@/lib/levies/calc";
import { streamLabel, isValidStreamKey } from "@/lib/levies/streams";
import {
  ensureRecords, recalcOpen, checkDrift, closeRecords, reopenRecord, insertPayment, removePayment, applyAdjustment, acceptDrift,
  carryCredit, effectiveFromProblem, lastFullPeriod, loadDailyIncome, fundNames, safeTz, toVersionInput, toRuleInput, liveFigure,
} from "@/lib/levies/engine";
import { queryLevyPayments, getBranchLevies, parseSchedule } from "@/lib/data/levies";
import type { Frequency, RuleInput, VersionInput } from "@/lib/levies/types";
import type { ScheduleItem } from "@/lib/levies/view-types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const FREQS: Frequency[] = ["monthly", "quarterly", "yearly"];
const METHODS = Object.keys(METHOD_LABELS);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const asFreq = (f: string): Frequency => (f === "quarterly" || f === "yearly" ? f : "monthly");

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
  return { ok: false, error: msg };
}

function revalidateAll(withMoney = false) {
  revalidatePath("/app/levies");
  if (withMoney) {
    revalidatePath("/app/expenses");
    revalidatePath("/app/accounting");
  }
}

async function readSession() {
  const s = await requireSession();
  const a = levyAccess(s);
  if (!a.see) throw new Error("Your role cannot see levies.");
  if (a.lockedFeature) throw new PlanLockedError("levies");
  return { s, a };
}

async function writeSession() {
  const s = await requireSession();
  assertCanWrite(s, "levies");
  return { s, a: levyAccess(s) };
}

async function tzOf(churchId: string) {
  const c = await db.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  return safeTz(c?.timezone);
}

const by = (s: Session) => ({ id: s.userId, name: s.name });

async function logChange(s: Session, rule: { id: string; name: string }, action: string, summary: string, before?: unknown, after?: unknown) {
  await db.levyRuleChange.create({
    data: {
      churchId: s.churchId, ruleId: rule.id, ruleName: rule.name, action, summary: summary.slice(0, 500),
      before: (before ?? undefined) as Prisma.InputJsonValue | undefined, after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      byUserId: s.userId, byName: s.name,
    },
  });
}

/* ───────────── Rules ───────────── */

export interface RuleDraft {
  id?: string;
  name: string;
  payee: string;
  payeeKind: string;
  /** The payee is this church's linked main church. */
  payeeIsParent: boolean;
  kind: "percent" | "fixed";
  rate: number | null;
  fixedAmount: number | null;
  allIncome: boolean;
  sources: string[];
  minAmount: number | null;
  maxAmount: number | null;
  afterRuleId: string | null;
  frequency: Frequency;
  yearStartMonth: number;
  dueDays: number;
  startsYmd: string;
  /** For edits: the day the new figures start to apply. */
  effectiveFromYmd?: string | null;
  notes?: string | null;
  templateKey?: string | null;
}

type CleanDraft = Omit<RuleDraft, "rate" | "fixedAmount" | "minAmount" | "maxAmount"> & {
  rate: string | null; fixedAmount: string | null; minAmount: string | null; maxAmount: string | null; payeeChurchId: string | null;
};

const decimalText = (n: number | null | undefined, places: number) => (n === null || n === undefined || n === ("" as unknown) || !Number.isFinite(Number(n)) ? null : Number(n).toFixed(places));

/** Check and tidy a draft. Throws a plain-English message when something is wrong. */
async function cleanDraft(s: Session, d: RuleDraft): Promise<CleanDraft> {
  const name = String(d.name ?? "").trim().slice(0, 80);
  const payee = String(d.payee ?? "").trim().slice(0, 80);
  if (!name) throw new Error("Give the levy a name, for example Head office tithe share.");
  if (!payee) throw new Error("Say who receives it.");
  const kind = d.kind === "fixed" ? "fixed" : "percent";
  const frequency = FREQS.includes(d.frequency) ? d.frequency : "monthly";
  const yearStartMonth = clampMonth(Math.round(Number(d.yearStartMonth)));
  const dueDays = Math.round(Number(d.dueDays));
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 120) throw new Error("Due days must be between 0 and 120.");
  if (!YMD.test(d.startsYmd ?? "")) throw new Error("Choose the date this levy starts.");
  if (d.effectiveFromYmd && !YMD.test(d.effectiveFromYmd)) throw new Error("Choose a valid date for when the change applies.");

  let rate: string | null = null;
  let fixedAmount: string | null = null;
  if (kind === "percent") {
    const r = Number(d.rate);
    if (!Number.isFinite(r) || r <= 0 || r > 100) throw new Error("The percentage must be above 0 and no more than 100.");
    if (Math.round(r * 10000) !== Number((r * 10000).toFixed(6))) throw new Error("Use at most 4 decimal places for the percentage.");
    rate = r.toFixed(4);
  } else {
    const f = Number(d.fixedAmount);
    if (!Number.isFinite(f) || f <= 0 || f > 100_000_000) throw new Error("Enter the fixed amount, above zero.");
    fixedAmount = f.toFixed(2);
  }
  const minAmount = decimalText(d.minAmount, 2);
  const maxAmount = decimalText(d.maxAmount, 2);
  if (minAmount && Number(minAmount) < 0) throw new Error("The minimum cannot be below zero.");
  if (maxAmount && Number(maxAmount) <= 0) throw new Error("The maximum must be above zero.");
  if (minAmount && maxAmount && Number(minAmount) > Number(maxAmount)) throw new Error("The minimum is more than the maximum.");

  const allIncome = kind === "percent" && !!d.allIncome;
  let sources = kind === "percent" && !allIncome ? [...new Set((d.sources ?? []).filter(isValidStreamKey))].slice(0, 40) : [];
  if (kind === "percent" && !allIncome && sources.length === 0) throw new Error("Tick at least one kind of income this levy is worked out on.");
  // Fund sources must be this church's own funds.
  const fundIds = sources.filter((k) => k.startsWith("fund:") && k !== "fund:none").map((k) => k.slice(5));
  if (fundIds.length) {
    const own = new Set((await db.fund.findMany({ where: { churchId: s.churchId, id: { in: fundIds } }, select: { id: true } })).map((f) => f.id));
    sources = sources.filter((k) => !k.startsWith("fund:") || k === "fund:none" || own.has(k.slice(5)));
    if (kind === "percent" && !allIncome && sources.length === 0) throw new Error("Those funds could not be found. Tick the income again.");
  }

  let payeeChurchId: string | null = null;
  if (d.payeeIsParent) {
    const me = await db.church.findUnique({ where: { id: s.churchId }, select: { parentChurchId: true } });
    if (!me?.parentChurchId) throw new Error("This church is not linked to a main church.");
    payeeChurchId = me.parentChurchId;
  }

  let afterRuleId: string | null = null;
  if (d.afterRuleId) {
    const prior = await db.levyRule.findFirst({ where: { id: d.afterRuleId, churchId: s.churchId }, select: { id: true, frequency: true, afterRuleId: true } });
    if (!prior || prior.id === d.id) throw new Error("Choose another of your levies to work this one out after.");
    if (kind !== "percent") throw new Error("Only a percentage levy can be worked out on what is left after another levy.");
    if (prior.frequency !== frequency) throw new Error("A levy worked out after another must use the same frequency (both monthly, for example).");
    if (prior.afterRuleId) throw new Error("That levy is itself worked out after another one. Only one step is allowed.");
    if (d.id && (await db.levyRule.count({ where: { churchId: s.churchId, afterRuleId: d.id } }))) throw new Error("Another levy is worked out after this one, so this one cannot also follow a levy.");
    afterRuleId = prior.id;
  }

  return {
    ...d, name, payee, payeeKind: PAYEE_KINDS.some((k) => k.value === d.payeeKind) ? d.payeeKind : "other", kind, frequency, yearStartMonth, dueDays,
    rate, fixedAmount, minAmount, maxAmount, allIncome, sources, afterRuleId, payeeChurchId,
    notes: (d.notes ?? "").trim().slice(0, 500) || null, templateKey: (d.templateKey ?? "").slice(0, 40) || null,
  };
}

/** Refuse when the percentages on any one kind of income would add up to more than all of it. */
async function checkCombinedRates(s: Session, d: CleanDraft, tz: string) {
  if (d.kind !== "percent") return;
  const today = ymdInTz(new Date(), tz);
  const others = await db.levyRule.findMany({ where: { churchId: s.churchId, active: true, ...(d.id ? { id: { not: d.id } } : {}) }, include: { versions: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] } } });
  const names = await fundNames(db, s.churchId);
  const draftVersion: VersionInput = { id: "draft", fromYmd: today, kind: "percent", rate: d.rate, fixedAmount: null, allIncome: d.allIncome, sources: d.sources, minAmount: null, maxAmount: null };
  const rules = [
    ...others.map((r) => ({ id: r.id, name: r.name, afterRuleId: r.afterRuleId, version: versionOn(r.versions.map((v) => toVersionInput(v, tz)), today) })),
    { id: d.id ?? "draft", name: d.name, afterRuleId: d.afterRuleId, version: draftVersion },
  ];
  const streams = [...new Set(rules.flatMap((r) => (r.version?.kind === "percent" && !r.version.allIncome ? r.version.sources : [])).concat([...names.keys()].map((id) => `fund:${id}`), ["fund:none"]))];
  const over = validateRates(rules, streams);
  if (over.length) {
    const first = over[0];
    throw new Error(`These levies would take more than all of your ${streamLabel(first.stream, names)} (${fmtRate(first.totalUnits)} together). Lower a percentage first.`);
  }
}

function versionData(s: Session, ruleId: string, d: CleanDraft, effectiveFrom: Date) {
  return {
    churchId: s.churchId, ruleId, effectiveFrom, kind: d.kind, rate: d.rate, fixedAmount: d.fixedAmount, allIncome: d.allIncome,
    sources: d.sources, minAmount: d.minAmount, maxAmount: d.maxAmount, createdById: s.userId, createdByName: s.name,
  };
}

const sameCalc = (v: { kind: string; rate: Prisma.Decimal | null; fixedAmount: Prisma.Decimal | null; allIncome: boolean; sources: string[]; minAmount: Prisma.Decimal | null; maxAmount: Prisma.Decimal | null }, d: CleanDraft) =>
  v.kind === d.kind &&
  (v.rate?.toFixed(4) ?? null) === d.rate &&
  (v.fixedAmount?.toFixed(2) ?? null) === d.fixedAmount &&
  v.allIncome === d.allIncome &&
  [...v.sources].sort().join("|") === [...d.sources].sort().join("|") &&
  (v.minAmount?.toFixed(2) ?? null) === d.minAmount &&
  (v.maxAmount?.toFixed(2) ?? null) === d.maxAmount;

const calcText = (d: { kind: string; rate: string | null; fixedAmount: string | null }) => (d.kind === "fixed" ? fmtGhs(toCents(d.fixedAmount)) : fmtRate(rateUnits(d.rate)));

/** Create or change one levy. Shared by the wizard, templates and the main church's suggestions. */
async function saveRuleCore(s: Session, raw: RuleDraft, opts: { action?: string } = {}): Promise<{ id: string; message: string }> {
  const tz = await tzOf(s.churchId);
  const d = await cleanDraft(s, raw);
  await checkCombinedRates(s, d, tz);
  const notes: string[] = [];

  if (!d.id) {
    // A fixed levy is charged for whole periods, so it starts on a period's first day.
    let startsYmd = d.startsYmd;
    if (d.kind === "fixed" && periodStartOf(startsYmd, d.frequency, d.yearStartMonth) !== startsYmd) {
      startsYmd = nextPeriodStart(startsYmd, d.frequency, d.yearStartMonth);
      notes.push(`A fixed amount is charged for whole periods, so it starts on ${longDate(startsYmd)}.`);
    }
    const startsOn = dayStart(startsYmd, tz);
    const rule = await db.levyRule.create({
      data: {
        churchId: s.churchId, name: d.name, payee: d.payee, payeeKind: d.payeeKind, payeeChurchId: d.payeeChurchId, frequency: d.frequency,
        yearStartMonth: d.yearStartMonth, dueDays: d.dueDays, startsOn, afterRuleId: d.afterRuleId, templateKey: d.templateKey, notes: d.notes,
        createdById: s.userId, sortOrder: await db.levyRule.count({ where: { churchId: s.churchId } }),
        versions: { create: [{ churchId: s.churchId, effectiveFrom: startsOn, kind: d.kind, rate: d.rate, fixedAmount: d.fixedAmount, allIncome: d.allIncome, sources: d.sources, minAmount: d.minAmount, maxAmount: d.maxAmount, createdById: s.userId, createdByName: s.name }] },
      },
      select: { id: true, name: true },
    });
    await logChange(s, rule, opts.action ?? "created", `Set up: ${calcText(d)}${d.kind === "percent" ? "" : ` each ${d.frequency.replace("ly", "")}`}, paid to ${d.payee}, starting ${longDate(startsYmd)}.`, null, { ...d, startsYmd });
    await audit(s, "create", "levy", `Set up the levy "${rule.name}"`, rule.id);
    await ensureRecords(db, s.churchId);
    await recalcOpen(db, s.churchId, { ruleIds: [rule.id] });
    return { id: rule.id, message: [`${rule.name} saved.`, ...notes].join(" ") };
  }

  // Editing
  const rule = await db.levyRule.findFirst({ where: { id: d.id, churchId: s.churchId }, include: { versions: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] } } });
  if (!rule) throw new Error("That levy could not be found.");
  const locked = (await db.levyRecord.count({ where: { ruleId: rule.id, OR: [{ state: "closed" }, { payments: { some: {} } }] } })) > 0;
  const oldStarts = ymdInTz(rule.startsOn, tz);
  const scheduleChanged = rule.frequency !== d.frequency || rule.yearStartMonth !== d.yearStartMonth || oldStarts !== d.startsYmd;
  if (scheduleChanged && locked) throw new Error("How often it is paid, the start date and the year start cannot change once a period is paid or closed. Use Replace this levy to start a new one from a date.");
  if (rule.afterRuleId !== d.afterRuleId && locked) throw new Error("Which levy this one follows cannot change once a period is paid or closed. Use Replace this levy instead.");

  const header: Prisma.LevyRuleUpdateInput = {};
  const changed: string[] = [];
  if (rule.name !== d.name) { header.name = d.name; changed.push(`name to "${d.name}"`); }
  if (rule.payee !== d.payee) { header.payee = d.payee; changed.push(`paid to ${d.payee}`); }
  if (rule.payeeKind !== d.payeeKind) header.payeeKind = d.payeeKind;
  if (rule.payeeChurchId !== d.payeeChurchId) { header.payeeChurch = d.payeeChurchId ? { connect: { id: d.payeeChurchId } } : { disconnect: true }; changed.push(d.payeeChurchId ? "paid to the main church" : "no longer paid to the main church"); }
  if (rule.dueDays !== d.dueDays) { header.dueDays = d.dueDays; changed.push(`due ${d.dueDays} days after each period`); }
  if ((rule.notes ?? null) !== d.notes) header.notes = d.notes;
  if (rule.afterRuleId !== d.afterRuleId) { header.afterRule = d.afterRuleId ? { connect: { id: d.afterRuleId } } : { disconnect: true }; changed.push(d.afterRuleId ? "worked out after another levy" : "worked out on the full income"); }
  if (scheduleChanged) {
    header.frequency = d.frequency;
    header.yearStartMonth = d.yearStartMonth;
    header.startsOn = dayStart(d.startsYmd, tz);
    changed.push(`schedule: ${d.frequency}, from ${longDate(d.startsYmd)}`);
  }

  await db.$transaction(async (tx) => {
    if (Object.keys(header).length) await tx.levyRule.update({ where: { id: rule.id }, data: header });
    if (scheduleChanged) {
      // Nothing is paid or closed yet, so the periods are simply rebuilt.
      await tx.levyRecord.deleteMany({ where: { ruleId: rule.id, payments: { none: {} }, state: "open" } });
      const first = rule.versions[0];
      if (first) await tx.levyRuleVersion.update({ where: { id: first.id }, data: { effectiveFrom: dayStart(d.startsYmd, tz) } });
    }
    if (d.dueDays !== rule.dueDays) {
      // Due dates of periods not yet closed follow the new setting.
      const open = await tx.levyRecord.findMany({ where: { ruleId: rule.id, state: "open" }, select: { id: true, periodEnd: true } });
      for (const r of open) await tx.levyRecord.update({ where: { id: r.id }, data: { dueDate: dayStart(addDays(ymdInTz(r.periodEnd, tz), d.dueDays - 1), tz) } });
    }
  });
  if (changed.length) await logChange(s, { id: rule.id, name: d.name }, "edited", `Changed ${changed.join(", ")}.`, { name: rule.name, payee: rule.payee, dueDays: rule.dueDays }, { name: d.name, payee: d.payee, dueDays: d.dueDays });

  // The figures: a new version from a date, never an edit of an old one.
  const today = ymdInTz(new Date(), tz);
  const current = versionOn(rule.versions.map((v) => toVersionInput(v, tz)), today) ?? null;
  const currentRow = current ? rule.versions.find((v) => v.id === current.id) ?? null : rule.versions[rule.versions.length - 1] ?? null;
  if (!currentRow || !sameCalc(currentRow, d)) {
    let fromYmd = d.effectiveFromYmd || today;
    if (scheduleChanged || !currentRow) fromYmd = d.startsYmd;
    if (fromYmd < d.startsYmd) fromYmd = d.startsYmd;
    if (d.kind === "fixed" && periodStartOf(fromYmd, d.frequency, d.yearStartMonth) !== fromYmd) {
      fromYmd = nextPeriodStart(fromYmd, d.frequency, d.yearStartMonth);
      notes.push(`New amount applies from ${longDate(fromYmd)}.`);
    }
    const problem = await effectiveFromProblem(db, s.churchId, rule.id, fromYmd, tz);
    if (problem) throw new Error(problem);
    if (scheduleChanged && currentRow && rule.versions.length === 1) {
      await db.levyRuleVersion.update({ where: { id: currentRow.id }, data: { ...versionData(s, rule.id, d, dayStart(fromYmd, tz)), churchId: undefined, ruleId: undefined } });
    } else {
      await db.levyRuleVersion.create({ data: versionData(s, rule.id, d, dayStart(fromYmd, tz)) });
    }
    const before = currentRow ? calcText({ kind: currentRow.kind, rate: currentRow.rate?.toString() ?? null, fixedAmount: currentRow.fixedAmount?.toString() ?? null }) : "nothing";
    await logChange(s, { id: rule.id, name: d.name }, "rate_changed", `Changed from ${before} to ${calcText(d)}, applying from ${longDate(fromYmd)}.`, currentRow ? { kind: currentRow.kind, rate: currentRow.rate?.toString(), fixedAmount: currentRow.fixedAmount?.toString(), sources: currentRow.sources, allIncome: currentRow.allIncome } : null, { kind: d.kind, rate: d.rate, fixedAmount: d.fixedAmount, sources: d.sources, allIncome: d.allIncome, fromYmd });
  }

  await audit(s, "update", "levy", `Changed the levy "${d.name}"`, rule.id);
  await ensureRecords(db, s.churchId);
  const dependents = (await db.levyRule.findMany({ where: { churchId: s.churchId, afterRuleId: rule.id }, select: { id: true } })).map((r) => r.id);
  await recalcOpen(db, s.churchId, { ruleIds: [rule.id, ...dependents] });
  return { id: rule.id, message: [`${d.name} saved. Closed periods were not changed.`, ...notes].join(" ") };
}

export async function saveLevyRule(draft: RuleDraft): Promise<Result<{ id: string; message: string }>> {
  try {
    const { s } = await writeSession();
    const r = await saveRuleCore(s, draft);
    revalidateAll();
    return { ok: true, ...r };
  } catch (e) { return fail(e); }
}

/** Set up several levies from templates (or from the main church's suggestions) in one go. */
export async function applyLevyTemplates(drafts: RuleDraft[], source: "template" | "parent" = "template"): Promise<Result<{ created: number }>> {
  try {
    const { s } = await writeSession();
    const list = (drafts ?? []).slice(0, 10);
    if (!list.length) return { ok: false, error: "Choose at least one levy to add." };
    // Check every draft first, so a set is added whole or not at all.
    for (const d of list) await cleanDraft(s, { ...d, id: undefined, payeeIsParent: source === "parent" ? true : d.payeeIsParent });
    let created = 0;
    for (const d of list) {
      await saveRuleCore(s, { ...d, id: undefined, payeeIsParent: source === "parent" ? true : d.payeeIsParent }, { action: source === "parent" ? "adopted" : "template" });
      created++;
    }
    revalidateAll();
    return { ok: true, created };
  } catch (e) { return fail(e); }
}

/** Add levies from the main church's suggested list. Each one becomes this church's own levy, paid to the main church. */
export async function adoptParentLevySchedule(drafts: RuleDraft[]) {
  return applyLevyTemplates(drafts, "parent");
}

/** "Last month this would have been GH₵1,240.00 (10% of GH₵12,400.00 Tithes)." No writes. */
export async function previewLevy(draft: RuleDraft): Promise<Result<{ label: string; total: number; lines: string[]; cap: string | null; warnings: string[] }>> {
  try {
    const { s } = await readSession();
    const tz = await tzOf(s.churchId);
    const today = ymdInTz(new Date(), tz);
    const freq = FREQS.includes(draft.frequency) ? draft.frequency : "monthly";
    const ysm = clampMonth(Math.round(Number(draft.yearStartMonth)));
    const period = lastFullPeriod(today, freq, ysm);
    const kind = draft.kind === "fixed" ? "fixed" : "percent";
    const version: VersionInput = {
      id: "preview", fromYmd: period.startYmd, kind, rate: kind === "percent" ? Number(draft.rate) || 0 : null, fixedAmount: kind === "fixed" ? Number(draft.fixedAmount) || 0 : null,
      allIncome: !!draft.allIncome, sources: (draft.sources ?? []).filter(isValidStreamKey), minAmount: draft.minAmount ?? null, maxAmount: draft.maxAmount ?? null,
    };
    let after: RuleInput | null = null;
    let afterName: string | null = null;
    if (draft.afterRuleId) {
      const prior = await db.levyRule.findFirst({ where: { id: draft.afterRuleId, churchId: s.churchId }, include: { versions: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] } } });
      if (prior) { after = { ...toRuleInput(prior, tz), startsYmd: "1900-01-01" }; afterName = prior.name; }
    }
    const rule: RuleInput = { id: "preview", name: draft.name || "This levy", startsYmd: period.startYmd, endsYmd: null, versions: [version], after };
    const income = await loadDailyIncome(db, s.churchId, dayStart(period.startYmd, tz), dayStart(period.endYmd, tz), tz);
    const names = await fundNames(db, s.churchId);
    const comp = computeLevy({ period, rule, income, label: (k) => streamLabel(k, names) });
    return {
      ok: true, label: period.label, total: centsToNumber(comp.calculatedCents),
      lines: comp.lines.map((l) => explainLine(l, afterName, period.label)), cap: explainCap(comp), warnings: comp.warnings,
    };
  } catch (e) { return fail(e); }
}

/** Stop a levy counting after a day. Its history and payments stay. */
export async function archiveLevyRule(id: string, lastDayYmd: string): Promise<Result> {
  try {
    const { s } = await writeSession();
    const tz = await tzOf(s.churchId);
    const rule = await db.levyRule.findFirst({ where: { id, churchId: s.churchId }, select: { id: true, name: true, startsOn: true } });
    if (!rule) return { ok: false, error: "That levy could not be found." };
    if (!YMD.test(lastDayYmd)) return { ok: false, error: "Choose the last day this levy counts." };
    const endsYmd = addDays(lastDayYmd, 1);
    if (endsYmd <= ymdInTz(rule.startsOn, tz)) return { ok: false, error: "That is before the levy started." };
    const endsOn = dayStart(endsYmd, tz);
    await db.$transaction([
      db.levyRule.update({ where: { id: rule.id }, data: { active: false, endsOn } }),
      // Periods that start after it ends, with nothing paid, are no longer needed.
      db.levyRecord.deleteMany({ where: { ruleId: rule.id, periodStart: { gte: endsOn }, state: "open", payments: { none: {} } } }),
    ]);
    await logChange(s, rule, "archived", `Stopped counting after ${longDate(lastDayYmd)}.`);
    await audit(s, "update", "levy", `Archived the levy "${rule.name}"`, rule.id);
    await recalcOpen(db, s.churchId, { ruleIds: [rule.id] });
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function restoreLevyRule(id: string): Promise<Result> {
  try {
    const { s } = await writeSession();
    const rule = await db.levyRule.findFirst({ where: { id, churchId: s.churchId }, select: { id: true, name: true } });
    if (!rule) return { ok: false, error: "That levy could not be found." };
    await db.levyRule.update({ where: { id: rule.id }, data: { active: true, endsOn: null } });
    await logChange(s, rule, "restored", "Counting again.");
    await audit(s, "update", "levy", `Restored the levy "${rule.name}"`, rule.id);
    await ensureRecords(db, s.churchId);
    await recalcOpen(db, s.churchId, { ruleIds: [rule.id] });
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteLevyRule(id: string): Promise<Result> {
  try {
    const { s } = await writeSession();
    assertCanDelete(s);
    const rule = await db.levyRule.findFirst({ where: { id, churchId: s.churchId }, select: { id: true, name: true } });
    if (!rule) return { ok: false, error: "That levy could not be found." };
    const kept = await db.levyRecord.count({ where: { ruleId: rule.id, OR: [{ state: "closed" }, { payments: { some: {} } }] } });
    if (kept) return { ok: false, error: "This levy has payments or closed periods. Archive it instead so the history stays." };
    await db.levyRule.delete({ where: { id: rule.id } });
    await logChange(s, rule, "deleted", "Deleted before anything was paid or closed.");
    await audit(s, "delete", "levy", `Deleted the levy "${rule.name}"`, rule.id);
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/* ───────────── Periods ───────────── */

export async function recalculateLevies(year?: number): Promise<Result<{ checked: number; changed: number; before: number; after: number }>> {
  try {
    const { s } = await writeSession();
    await ensureRecords(db, s.churchId);
    const r = await recalcOpen(db, s.churchId, { year: year && year > 1990 && year < 2200 ? year : undefined });
    await checkDrift(db, s.churchId);
    revalidateAll();
    return { ok: true, checked: r.checked, changed: r.changed, before: centsToNumber(r.beforeCents), after: centsToNumber(r.afterCents) };
  } catch (e) { return fail(e); }
}

export async function closeLevyPeriods(recordIds: string[]): Promise<Result<{ closed: number; stillCounting: number }>> {
  try {
    const { s } = await writeSession();
    const ids = [...new Set((recordIds ?? []).filter((x) => typeof x === "string"))].slice(0, 200);
    const r = await closeRecords(db, s.churchId, ids, by(s));
    if (r.closed) await audit(s, "update", "levy-period", `Closed ${r.closed} levy period${r.closed === 1 ? "" : "s"}`);
    revalidateAll();
    if (!r.closed && r.stillCounting) return { ok: false, error: "That period is still counting. It can be closed once it has ended." };
    return { ok: true, ...r };
  } catch (e) { return fail(e); }
}

export async function reopenLevyPeriod(recordId: string, reason: string): Promise<Result> {
  try {
    const { s, a } = await writeSession();
    if (!a.reopen) return { ok: false, error: "Only the Main Admin or an Admin can reopen a closed period." };
    const why = String(reason ?? "").trim().slice(0, 300);
    if (why.length < 3) return { ok: false, error: "Say why it is being reopened." };
    const rec = await db.levyRecord.findFirst({ where: { id: recordId, churchId: s.churchId }, select: { id: true, periodKey: true, rule: { select: { id: true, name: true, frequency: true, yearStartMonth: true } } } });
    if (!rec) return { ok: false, error: "That period could not be found." };
    if (!(await reopenRecord(db, s.churchId, rec.id))) return { ok: false, error: "That period is not closed." };
    const label = periodLabel(rec.periodKey, asFreq(rec.rule.frequency), rec.rule.yearStartMonth);
    await logChange(s, rec.rule, "reopened", `Reopened ${label}: ${why}`);
    await audit(s, "update", "levy-period", `Reopened ${rec.rule.name} for ${label}: ${why}`, rec.id);
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/* ───────────── Payments ───────────── */

export interface PaymentDraft {
  amount: number;
  paidOnYmd: string;
  method: string;
  reference?: string | null;
  accountId?: string | null;
  createExpense: boolean;
  proof?: { key: string; name?: string | null; type?: string | null } | null;
  note?: string | null;
}

async function cleanPayment(s: Session, p: PaymentDraft, tz: string) {
  const amountCents = toCents(Number(p.amount));
  if (!(amountCents > ZERO)) throw new Error("Enter the amount paid.");
  if (amountCents > toCents(100_000_000)) throw new Error("That amount is too large.");
  if (!YMD.test(p.paidOnYmd ?? "")) throw new Error("Choose the date it was paid.");
  if (p.paidOnYmd > ymdInTz(new Date(), tz)) throw new Error("The date paid cannot be in the future.");
  const method = METHODS.includes(p.method) ? p.method : "bank";
  const createExpense = !!p.createExpense;
  let accountId: string | null = null;
  if (p.accountId && p.accountId !== "none") {
    accountId = await ownedId("churchAccount", p.accountId, s.churchId);
    if (!accountId) throw new Error("That account could not be found.");
  }
  if (createExpense && !accountId) {
    const { resolveAccountId } = await import("@/lib/data/accounts");
    accountId = await resolveAccountId(s.churchId, null);
  }
  let proof: { key: string; name: string | null; type: string | null } | null = null;
  if (p.proof?.key) {
    if (!p.proof.key.startsWith(`levy-proof/${s.churchId}/`) || p.proof.key.includes("..")) throw new Error("That receipt file could not be used. Please add it again.");
    proof = { key: p.proof.key.slice(0, 200), name: (p.proof.name ?? "").slice(0, 120) || null, type: (p.proof.type ?? "").slice(0, 60) || null };
  }
  return {
    amountCents, paidOn: zonedToUtc(p.paidOnYmd, "12:00", tz), method, createExpense, accountId, proof,
    reference: (p.reference ?? "").trim().slice(0, 80) || null, note: (p.note ?? "").trim().slice(0, 300) || null,
  };
}

export async function recordLevyPayment(recordId: string, input: PaymentDraft): Promise<Result<{ message: string }>> {
  try {
    const { s } = await writeSession();
    const church = await db.church.findUnique({ where: { id: s.churchId }, select: { timezone: true, levyAutoClose: true } });
    const tz = safeTz(church?.timezone);
    const rec = await db.levyRecord.findFirst({ where: { id: recordId, churchId: s.churchId }, select: { id: true, periodKey: true, rule: { select: { name: true, payee: true, frequency: true, yearStartMonth: true } } } });
    if (!rec) return { ok: false, error: "That levy period could not be found." };
    const p = await cleanPayment(s, input, tz);
    // Bring the figures up to date first, so a period that closes itself freezes the latest amount.
    await recalcOpen(db, s.churchId, { recordIds: [rec.id] });
    const label = periodLabel(rec.periodKey, asFreq(rec.rule.frequency), rec.rule.yearStartMonth);
    const r = await insertPayment(db, {
      churchId: s.churchId, recordId: rec.id, amountCents: p.amountCents, paidOn: p.paidOn, method: p.method, reference: p.reference,
      accountId: p.accountId, createExpense: p.createExpense, expense: { description: `${rec.rule.name}, ${label}`, vendor: rec.rule.payee },
      proof: p.proof, note: p.note, by: by(s), autoClose: church?.levyAutoClose ?? true, tz,
    });
    await audit(s, "create", "levy-payment", `Recorded ${fmtGhs(p.amountCents)} paid for ${rec.rule.name}, ${label}`, r.paymentId);
    revalidateAll(true);
    const msg = `Payment of ${fmtGhs(p.amountCents)} recorded.${r.expenseId ? " Expense added to Accounts." : ""}${r.closed ? ` ${label} is fully paid and now closed.` : ""}`;
    return { ok: true, message: msg };
  } catch (e) { return fail(e); }
}

/** One payment split across several periods, oldest first. Anything over what they owe goes on the newest one. */
export async function recordLevyPayments(recordIds: string[], input: PaymentDraft): Promise<Result<{ message: string; count: number }>> {
  try {
    const { s } = await writeSession();
    const church = await db.church.findUnique({ where: { id: s.churchId }, select: { timezone: true, levyAutoClose: true } });
    const tz = safeTz(church?.timezone);
    const ids = [...new Set((recordIds ?? []).filter((x) => typeof x === "string"))].slice(0, 60);
    if (ids.length === 0) return { ok: false, error: "Choose the periods this payment covers." };
    await recalcOpen(db, s.churchId, { recordIds: ids });
    const recs = await db.levyRecord.findMany({
      where: { churchId: s.churchId, id: { in: ids } }, orderBy: { periodStart: "asc" },
      select: { id: true, periodKey: true, amountDue: true, amountPaid: true, rule: { select: { name: true, payee: true, frequency: true, yearStartMonth: true } } },
    });
    if (recs.length !== ids.length) return { ok: false, error: "Some of those periods could not be found." };
    const p = await cleanPayment(s, input, tz);
    const { allocations, leftoverCents } = allocateOldestFirst(p.amountCents, recs.map((r) => ({ id: r.id, leftCents: toCents(r.amountDue.toString()) - toCents(r.amountPaid.toString()) })));
    if (leftoverCents > ZERO) {
      const lastId = recs[recs.length - 1].id;
      const last = allocations.find((a) => a.id === lastId);
      if (last) last.cents += leftoverCents; else allocations.push({ id: lastId, cents: leftoverCents });
    }
    let count = 0;
    for (const a of allocations) {
      const rec = recs.find((r) => r.id === a.id)!;
      const label = periodLabel(rec.periodKey, asFreq(rec.rule.frequency), rec.rule.yearStartMonth);
      await insertPayment(db, {
        churchId: s.churchId, recordId: rec.id, amountCents: a.cents, paidOn: p.paidOn, method: p.method, reference: p.reference,
        accountId: p.accountId, createExpense: p.createExpense, expense: { description: `${rec.rule.name}, ${label}`, vendor: rec.rule.payee },
        proof: p.proof, note: p.note, by: by(s), autoClose: church?.levyAutoClose ?? true, tz,
      });
      count++;
    }
    await audit(s, "create", "levy-payment", `Recorded ${fmtGhs(p.amountCents)} across ${count} levy period${count === 1 ? "" : "s"}`);
    revalidateAll(true);
    return { ok: true, count, message: `Payment of ${fmtGhs(p.amountCents)} recorded across ${count} period${count === 1 ? "" : "s"}, oldest first.${p.createExpense ? " Expenses added to Accounts." : ""}` };
  } catch (e) { return fail(e); }
}

export async function deleteLevyPayment(paymentId: string): Promise<Result> {
  try {
    const { s } = await writeSession();
    assertCanDelete(s);
    const pay = await db.levyPayment.findFirst({ where: { id: paymentId, churchId: s.churchId }, include: { record: { select: { periodKey: true, rule: { select: { name: true, frequency: true, yearStartMonth: true } } } } } });
    if (!pay) return { ok: false, error: "That payment could not be found." };
    if (pay.expenseId) {
      const { RecycleBin } = await import("@/lib/recycle-bin");
      await RecycleBin.captureExpense(s, pay.expenseId);
    }
    await removePayment(db, s.churchId, pay.id);
    if (pay.proofKey) {
      const { deleteObject } = await import("@/lib/storage");
      await deleteObject(pay.proofKey).catch(() => {});
    }
    const label = periodLabel(pay.record.periodKey, asFreq(pay.record.rule.frequency), pay.record.rule.yearStartMonth);
    await logAudit({
      churchId: s.churchId, userId: s.userId, action: "delete", entity: "levy-payment", entityId: pay.id,
      detail: `Removed the ${fmtGhs(toCents(pay.amount.toString()))} payment for ${pay.record.rule.name}, ${label}${pay.expenseId ? " and its expense" : ""}`,
      meta: { amount: pay.amount.toString(), paidOn: pay.paidOn.toISOString(), method: pay.method, reference: pay.reference, expenseId: pay.expenseId, recordId: pay.recordId },
    });
    revalidateAll(true);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/* ───────────── Adjustments, waivers, credits, changed giving ───────────── */

export async function addLevyAdjustment(recordId: string, amount: number, reason: string): Promise<Result> {
  try {
    const { s } = await writeSession();
    const why = String(reason ?? "").trim().slice(0, 300);
    if (why.length < 3) return { ok: false, error: "Say why the amount is being adjusted." };
    const cents = toCents(Number(amount));
    if (cents === ZERO) return { ok: false, error: "Enter the amount to add or take off." };
    const rec = await db.levyRecord.findFirst({ where: { id: recordId, churchId: s.churchId }, select: { id: true, rule: { select: { name: true } } } });
    if (!rec) return { ok: false, error: "That period could not be found." };
    await applyAdjustment(db, { churchId: s.churchId, recordId: rec.id, amountCents: cents, kind: "manual", reason: why, by: by(s) });
    await audit(s, "update", "levy-period", `Adjusted ${rec.rule.name} by ${fmtGhs(cents)}: ${why}`, rec.id);
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function acceptLevyDrift(recordId: string, mode: "carry" | "ignore", reason?: string): Promise<Result<{ message: string }>> {
  try {
    const { s, a } = await writeSession();
    if (mode === "ignore" && !a.reopen) return { ok: false, error: "Only the Main Admin or an Admin can leave a closed period as it was." };
    const why = String(reason ?? "").trim().slice(0, 300);
    if (mode === "ignore" && why.length < 3) return { ok: false, error: "Say why the closed period is being left as it was." };
    const rec = await db.levyRecord.findFirst({ where: { id: recordId, churchId: s.churchId }, select: { id: true, periodKey: true, rule: { select: { id: true, name: true, frequency: true, yearStartMonth: true } } } });
    if (!rec) return { ok: false, error: "That period could not be found." };
    const label = periodLabel(rec.periodKey, asFreq(rec.rule.frequency), rec.rule.yearStartMonth);
    const r = await acceptDrift(db, { churchId: s.churchId, recordId: rec.id, mode, reason: why || `Giving for ${label} changed after it was closed`, by: by(s) });
    const text = mode === "carry" ? `${fmtGhs(r.carried)} added to ${r.to} because giving for ${label} changed after it was closed.` : `${label} left as it was (${fmtGhs(r.carried)} difference): ${why}`;
    await logChange(s, rec.rule, mode === "carry" ? "drift_carried" : "drift_ignored", text);
    await audit(s, "update", "levy-period", text, rec.id);
    revalidateAll();
    return { ok: true, message: text };
  } catch (e) { return fail(e); }
}

export async function carryLevyCredit(recordId: string): Promise<Result<{ message: string }>> {
  try {
    const { s } = await writeSession();
    const rec = await db.levyRecord.findFirst({ where: { id: recordId, churchId: s.churchId }, select: { id: true, rule: { select: { name: true } } } });
    if (!rec) return { ok: false, error: "That period could not be found." };
    const r = await carryCredit(db, { churchId: s.churchId, recordId: rec.id, by: by(s) });
    const msg = `${fmtGhs(r.credit)} extra moved to ${r.to}.`;
    await audit(s, "update", "levy-period", `${rec.rule.name}: ${msg}`, rec.id);
    revalidateAll();
    return { ok: true, message: msg };
  } catch (e) { return fail(e); }
}

export async function waiveLevy(recordId: string, reason: string): Promise<Result> {
  try {
    const { s, a } = await writeSession();
    if (!a.reopen) return { ok: false, error: "Only the Main Admin or an Admin can waive a levy." };
    const why = String(reason ?? "").trim().slice(0, 300);
    if (why.length < 3) return { ok: false, error: "Say why it is being waived (for example, who agreed to it)." };
    const rec = await db.levyRecord.findFirst({ where: { id: recordId, churchId: s.churchId }, select: { id: true, state: true, amountDue: true, amountPaid: true, rule: { select: { name: true } } } });
    if (!rec) return { ok: false, error: "That period could not be found." };
    const left = toCents(rec.amountDue.toString()) - toCents(rec.amountPaid.toString());
    if (left <= ZERO) return { ok: false, error: "Nothing is left to waive." };
    await applyAdjustment(db, { churchId: s.churchId, recordId: rec.id, amountCents: -left, kind: "waiver", reason: why, by: by(s) });
    await audit(s, "update", "levy-period", `Waived ${fmtGhs(left)} of ${rec.rule.name}: ${why}`, rec.id);
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** What a closed period would be now, for "See how this was worked out". */
export async function liveLevyFigure(recordId: string): Promise<Result<{ live: number; lines: string[] }>> {
  try {
    const { s } = await readSession();
    const r = await liveFigure(db, s.churchId, recordId);
    if (!r) return { ok: false, error: "That period could not be found." };
    return { ok: true, live: centsToNumber(r.comp.calculatedCents), lines: r.breakdown.lines.map((l) => l.text) };
  } catch (e) { return fail(e); }
}

/* ───────────── Settings ───────────── */

export async function saveLevySettings(input: { remindOn: boolean; remindDays: number[]; remindSms: boolean; remindUserIds: string[]; autoClose: boolean }): Promise<Result> {
  try {
    const { s } = await writeSession();
    const days = [...new Set((input.remindDays ?? []).map((d) => Math.round(Number(d))).filter((d) => Number.isInteger(d) && d >= 1 && d <= 60))].sort((a, b) => b - a).slice(0, 4);
    const ids = (input.remindUserIds ?? []).filter((x) => typeof x === "string").slice(0, 30);
    const users = ids.length ? (await db.user.findMany({ where: { churchId: s.churchId, id: { in: ids } }, select: { id: true } })).map((u) => u.id) : [];
    await db.church.update({ where: { id: s.churchId }, data: { levyRemindOn: !!input.remindOn, levyRemindDays: days, levyRemindSms: !!input.remindSms, levyRemindUserIds: users, levyAutoClose: !!input.autoClose } });
    await audit(s, "update", "settings", `Levy reminders ${input.remindOn ? `on (${days.join(", ")} days before${input.remindSms ? ", with texts" : ""})` : "off"}; close fully paid periods by themselves ${input.autoClose ? "on" : "off"}`);
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/* ───────────── Lists ───────────── */

export async function searchLevyPayments(search: string, filters: { ruleId?: string; year?: number }, page: number) {
  const { s } = await readSession();
  return queryLevyPayments(s.churchId, String(search ?? ""), { ruleId: typeof filters?.ruleId === "string" ? filters.ruleId : undefined, year: Number(filters?.year) || undefined }, page);
}

/* ───────────── Linked churches (Max) ───────────── */

export async function getBranchLeviesAction(year: number) {
  const { s } = await readSession();
  assertPlanFeature(s, "linked-churches");
  return getBranchLevies(s.churchId, Number(year) || new Date().getFullYear());
}

/** The main church confirms it received a linked church's payment. The only change made across churches. */
export async function confirmBranchLevyPayment(paymentId: string): Promise<Result> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "levies");
    assertPlanFeature(s, "linked-churches");
    const pay = await db.levyPayment.findFirst({
      where: { id: paymentId, record: { rule: { payeeChurchId: s.churchId } }, church: { parentChurchId: s.churchId, linkShare: { has: "levies" } } },
      select: { id: true, amount: true, parentConfirmedAt: true, church: { select: { name: true } } },
    });
    if (!pay) return { ok: false, error: "That payment could not be found, or that church no longer shares its levies with you." };
    if (!pay.parentConfirmedAt) await db.levyPayment.update({ where: { id: pay.id }, data: { parentConfirmedAt: new Date(), parentConfirmedByName: `${s.churchName} (${s.name})`.slice(0, 120) } });
    await audit(s, "update", "levy-payment", `Confirmed receiving ${fmtGhs(toCents(pay.amount.toString()))} from ${pay.church.name}`, pay.id);
    revalidateAll();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** The main church publishes suggested levies its linked churches can add with one tap. */
export async function publishLevySchedule(items: ScheduleItem[]): Promise<Result<{ count: number }>> {
  try {
    const s = await requireSession();
    assertCanWrite(s, "levies");
    assertPlanFeature(s, "linked-churches");
    if (s.role !== "Owner" && s.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can publish suggested levies." };
    const clean = parseSchedule(items);
    for (const it of clean) {
      if (it.kind === "percent" && !(it.rate && it.rate > 0 && it.rate <= 100)) return { ok: false, error: `Give "${it.name}" a percentage between 0 and 100.` };
      if (it.kind === "fixed" && !(it.fixedAmount && it.fixedAmount > 0)) return { ok: false, error: `Give "${it.name}" an amount above zero.` };
    }
    await db.church.update({ where: { id: s.churchId }, data: { levySchedule: clean as unknown as Prisma.InputJsonValue } });
    await audit(s, "update", "settings", `Published ${clean.length} suggested levies for linked churches`);
    revalidateAll();
    return { ok: true, count: clean.length };
  } catch (e) { return fail(e); }
}
