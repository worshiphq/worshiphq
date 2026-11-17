// The levy calculator. Pure: integer pesewas (BigInt), local days as YYYY-MM-DD strings, no database.
import { ZERO, RATE_DIV, roundHalfUp, toCents, rateUnits, fmtGhs, maxBig, minBig } from "./money";
import { daysBetween, longDate, addDays } from "./periods";
import type { DailyIncome, LevyComputation, LevyLine, LevyStatus, PeriodWindow, RuleInput, StreamKey, VersionInput } from "./types";

const maxYmd = (a: string, b: string) => (a > b ? a : b);
const minYmd = (a: string, b: string) => (a < b ? a : b);

function sortedVersions(vs: VersionInput[]): VersionInput[] {
  return [...vs].sort((a, b) => (a.fromYmd < b.fromYmd ? -1 : a.fromYmd > b.fromYmd ? 1 : 0));
}

/** The version in effect on a day, or null before the first one. */
export function versionOn(vs: VersionInput[], ymd: string): VersionInput | null {
  let cur: VersionInput | null = null;
  for (const v of sortedVersions(vs)) if (v.fromYmd <= ymd) cur = v;
  return cur;
}

/** Sum a stream's daily income for [from, to). */
export function sumStream(income: DailyIncome, stream: StreamKey, from: string, to: string): bigint {
  const days = income.get(stream);
  if (!days) return ZERO;
  let s = ZERO;
  for (const [d, c] of days) if (d >= from && d < to) s += c;
  return s;
}

/** Version segments overlapping [from, to). */
function segments(vs: VersionInput[], from: string, to: string): { v: VersionInput; from: string; to: string }[] {
  const sorted = sortedVersions(vs);
  const out: { v: VersionInput; from: string; to: string }[] = [];
  sorted.forEach((v, i) => {
    const next = sorted[i + 1]?.fromYmd ?? "9999-12-31";
    const s = maxYmd(v.fromYmd, from);
    const e = minYmd(next, to);
    if (s < e) out.push({ v, from: s, to: e });
  });
  return out;
}

function streamsFor(v: VersionInput, income: DailyIncome): StreamKey[] {
  if (v.allIncome) return [...income.keys()].sort();
  return [...new Set(v.sources)];
}

/** Percent lines for a rule over [from, to), before caps. Used for the rule itself and, one level down, for its "after" rule. */
function percentLines(
  rule: RuleInput, from: string, to: string, period: PeriodWindow, income: DailyIncome, label: (k: StreamKey) => string,
  warnings: string[], depth: number,
): LevyLine[] {
  const lines: LevyLine[] = [];
  for (const seg of segments(rule.versions, from, to)) {
    if (seg.v.kind !== "percent") continue;
    const units = rateUnits(seg.v.rate);
    for (const stream of streamsFor(seg.v, income)) {
      let incomeCents = sumStream(income, stream, seg.from, seg.to);
      if (incomeCents === ZERO && seg.v.allIncome) continue;
      if (incomeCents < ZERO) {
        if (depth === 0) warnings.push(`${fmtGhs(-incomeCents)} of ${label(stream)} corrections could not be taken off this period, so ${label(stream)} counts as GH₵0.00.`);
        incomeCents = ZERO;
      }
      let afterCents = ZERO;
      if (rule.after && depth === 0) {
        const prior = percentLines(rule.after, seg.from, seg.to, period, income, label, warnings, depth + 1);
        afterCents = prior.filter((l) => l.stream === stream).reduce((s, l) => s + l.levyCents, ZERO);
        afterCents = minBig(afterCents, incomeCents);
      }
      const baseCents = incomeCents - afterCents;
      lines.push({
        kind: "percent", stream, label: label(stream), fromYmd: seg.from, toYmd: seg.to,
        incomeCents, afterCents, baseCents, rateUnits: units,
        levyCents: roundHalfUp(baseCents * units, RATE_DIV),
        versionId: seg.v.id,
        partial: seg.from !== period.startYmd || seg.to !== period.endYmd,
      });
    }
  }
  return lines;
}

/**
 * Work out one levy for one period.
 * - Percent: per version segment and per income stream; a rate change mid-period splits by income date.
 * - Fixed: the full amount for a period, using the version in effect on the period's first day. A fixed levy that starts
 *   or changes mid-period applies from the next period.
 * - Each line is rounded to the pesewa and the total is the sum of the rounded lines, so a statement adds up by hand.
 * - The minimum and maximum (of the version in effect at the end) apply after summing.
 */
export function computeLevy(input: { period: PeriodWindow; rule: RuleInput; income: DailyIncome; label: (k: StreamKey) => string }): LevyComputation {
  const { period, rule, income, label } = input;
  const warnings: string[] = [];
  const from = maxYmd(period.startYmd, rule.startsYmd);
  const to = rule.endsYmd ? minYmd(period.endYmd, rule.endsYmd) : period.endYmd;
  const empty: LevyComputation = { lines: [], incomeBaseCents: ZERO, rawCents: ZERO, calculatedCents: ZERO, cap: null, warnings, versionIds: [] };
  if (from >= to || rule.versions.length === 0) return empty;

  let lines: LevyLine[] = [];
  const atStart = versionOn(rule.versions, period.startYmd);
  if (atStart && atStart.kind === "fixed" && rule.startsYmd <= period.startYmd) {
    // A whole-period charge. Later changes inside this period wait for the next one.
    lines.push({
      kind: "fixed", stream: null, label: "Fixed amount", fromYmd: period.startYmd, toYmd: period.endYmd,
      incomeCents: ZERO, afterCents: ZERO, baseCents: ZERO, rateUnits: ZERO, levyCents: toCents(atStart.fixedAmount), versionId: atStart.id, partial: false,
    });
    if (segments(rule.versions, from, to).some((s) => s.v.id !== atStart.id)) warnings.push("A change made during this period applies from the next period.");
  } else {
    lines = percentLines(rule, from, to, period, income, label, warnings, 0);
    const fixedMid = segments(rule.versions, from, to).find((s) => s.v.kind === "fixed");
    if (fixedMid) warnings.push(`A fixed amount is charged for whole periods, so this one is first charged from ${longDate(addDays(period.endYmd, 0))}.`);
  }

  const rawCents = lines.reduce((s, l) => s + l.levyCents, ZERO);
  const incomeBaseCents = lines.reduce((s, l) => s + l.baseCents, ZERO);
  const last = versionOn(rule.versions, addDays(to, -1));
  let calculatedCents = rawCents;
  let cap: LevyComputation["cap"] = null;
  if (last) {
    const min = last.minAmount !== null && last.minAmount !== "" ? toCents(last.minAmount) : null;
    const max = last.maxAmount !== null && last.maxAmount !== "" ? toCents(last.maxAmount) : null;
    if (min !== null && min > ZERO && calculatedCents < min) { calculatedCents = min; cap = { kind: "min", limitCents: min }; }
    if (max !== null && max > ZERO && calculatedCents > max) { calculatedCents = max; cap = { kind: "max", limitCents: max }; }
  }
  return { lines, incomeBaseCents, rawCents, calculatedCents, cap, warnings, versionIds: [...new Set(lines.map((l) => l.versionId))] };
}

/* ───────── Status ───────── */

export interface StatusInput {
  todayYmd: string;
  /** Exclusive end of the period. */
  endYmd: string;
  dueYmd: string;
  dueCents: bigint;
  paidCents: bigint;
  waived?: boolean;
}

export interface StatusResult { status: LevyStatus; overdue: boolean; partPaid: boolean; leftCents: bigint; daysToDue: number }

/** The status of one levy record. Compared in pesewas, judged on the church's local day. */
export function statusOf(i: StatusInput): StatusResult {
  const leftCents = maxBig(ZERO, i.dueCents - i.paidCents);
  const daysToDue = daysBetween(i.todayYmd, i.dueYmd);
  const base = { leftCents, daysToDue, overdue: false, partPaid: false };
  if (i.todayYmd < i.endYmd) return { ...base, status: "counting", partPaid: i.paidCents > ZERO };
  if (i.dueCents <= ZERO) return { ...base, status: i.paidCents > ZERO ? "credit" : i.waived ? "waived" : "nothing_due" };
  if (i.paidCents === i.dueCents) return { ...base, status: "paid" };
  if (i.paidCents > i.dueCents) return { ...base, status: "credit" };
  const partPaid = i.paidCents > ZERO;
  if (i.todayYmd > i.dueYmd) return { ...base, status: "overdue", overdue: true, partPaid };
  if (partPaid) return { ...base, status: "part_paid", partPaid };
  return { ...base, status: "unpaid" };
}

/* ───────── Several rules on the same income ───────── */

export interface RateRule { id: string; name: string; afterRuleId?: string | null; version: VersionInput | null }

/** For each stream: each levy's effective share, the total, and what the church keeps (rate units, 100% = 1,000,000). */
export function retentionByStream(rules: RateRule[], streams: StreamKey[]) {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const unitsOn = (r: RateRule, s: StreamKey): bigint => {
    const v = r.version;
    if (!v || v.kind !== "percent") return ZERO;
    if (!v.allIncome && !v.sources.includes(s)) return ZERO;
    return rateUnits(v.rate);
  };
  return streams.map((stream) => {
    const shares = rules.map((r) => {
      let units = unitsOn(r, stream);
      const prior = r.afterRuleId ? byId.get(r.afterRuleId) : null;
      if (prior && units > ZERO) units = roundHalfUp(units * (RATE_DIV - unitsOn(prior, stream)), RATE_DIV);
      return { ruleId: r.id, name: r.name, units };
    }).filter((x) => x.units > ZERO);
    const totalUnits = shares.reduce((s, x) => s + x.units, ZERO);
    return { stream, shares, totalUnits, keepUnits: RATE_DIV - totalUnits };
  });
}

/** Streams where the levies together would take more than all of the income. Empty when fine. */
export function validateRates(rules: RateRule[], streams: StreamKey[]) {
  return retentionByStream(rules, streams).filter((r) => r.totalUnits > RATE_DIV);
}

/* ───────── Payments ───────── */

/** Split one payment across records, oldest first. Anything over what they owe comes back as leftover. */
export function allocateOldestFirst(amountCents: bigint, items: { id: string; leftCents: bigint }[]) {
  let left = amountCents;
  const allocations: { id: string; cents: bigint }[] = [];
  for (const it of items) {
    if (left <= ZERO) break;
    const take = minBig(left, maxBig(ZERO, it.leftCents));
    if (take > ZERO) { allocations.push({ id: it.id, cents: take }); left -= take; }
  }
  return { allocations, leftoverCents: left };
}

/** How much a closed period's levy has moved since it was closed, after differences already dealt with. */
export function driftOf(liveCents: bigint, calculatedCents: bigint, acceptedCents: bigint): bigint {
  return liveCents - calculatedCents - acceptedCents;
}

/**
 * Which reminders are due now. Milestones are "days before" values plus "od" (the day after the due date).
 * Every milestone already passed is consumed together, so a late run sends one message, never a burst, and none repeat.
 */
export function dueReminderMilestones(dueYmd: string, todayYmd: string, days: number[], sent: string[]) {
  const daysLeft = daysBetween(todayYmd, dueYmd);
  const clean = [...new Set(days.filter((d) => Number.isInteger(d) && d > 0))];
  if (daysLeft < 0) {
    const consume = [...clean.map(String), "od"].filter((m) => !sent.includes(m));
    return { send: sent.includes("od") ? null : ("overdue" as const), consume, daysLeft };
  }
  const reached = clean.filter((d) => daysLeft <= d && !sent.includes(String(d))).map(String);
  return { send: reached.length ? ("before" as const) : null, consume: reached, daysLeft };
}

/** A new rule version may not start inside (or before) a closed period. Returns the reason, or null when fine. */
export function checkEffectiveFrom(fromYmd: string, closed: { endYmd: string; label: string; lastDayLabel: string }[]): string | null {
  const latest = [...closed].sort((a, b) => (a.endYmd < b.endYmd ? 1 : -1))[0];
  if (latest && fromYmd < latest.endYmd) {
    return `That date is inside ${latest.label}, which is closed. Pick a date after ${latest.lastDayLabel} or reopen ${latest.label} first.`;
  }
  return null;
}
