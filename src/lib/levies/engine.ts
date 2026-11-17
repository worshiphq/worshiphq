// The levy engine: reads income, keeps one record per levy per period, recalculates open periods, records payments.
// Every function takes the Prisma client as its first argument and nothing here imports "server-only" or "@/lib/db",
// so the same code runs in the app and in the QA scripts.
import type { Prisma, PrismaClient } from "@prisma/client";
import { ymdInTz } from "@/lib/time/tz";
import { computeLevy, checkEffectiveFrom } from "./calc";
import { explainLine, explainCap } from "./explain";
import { ZERO, toCents, fromCents, centsToNumber, fmtGhs } from "./money";
import { addDays, addMonthsYmd, dayStart, dueYmdFor, longDate, periodBoundsYmd, periodLabel, periodsBetween, periodKeyFor } from "./periods";
import { streamKeyForGift, streamLabel, EXCLUDED_CATEGORIES } from "./streams";
import type { DailyIncome, Frequency, LevyComputation, RuleInput, StreamKey, VersionInput } from "./types";

export type Client = PrismaClient | Prisma.TransactionClient;
export const EXPENSE_CATEGORY = "Levies & remittances";
/** Open records are recalculated on page load when older than this. */
export const STALE_MS = 10 * 60 * 1000;

const asFreq = (f: string): Frequency => (f === "quarterly" || f === "yearly" ? f : "monthly");

export function safeTz(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "Africa/Accra" });
    return tz || "Africa/Accra";
  } catch {
    return "Africa/Accra";
  }
}

export async function churchTz(client: Client, churchId: string): Promise<string> {
  const c = await client.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  return safeTz(c?.timezone);
}

/* ───────── Turning rows into calculator input ───────── */

type VersionRow = {
  id: string; effectiveFrom: Date; kind: string; rate: Prisma.Decimal | null; fixedAmount: Prisma.Decimal | null;
  allIncome: boolean; sources: string[]; minAmount: Prisma.Decimal | null; maxAmount: Prisma.Decimal | null;
};
type RuleRow = { id: string; name: string; startsOn: Date; endsOn: Date | null; frequency: string; yearStartMonth: number; dueDays: number; afterRuleId: string | null; versions: VersionRow[] };

export function toVersionInput(v: VersionRow, tz: string): VersionInput {
  return {
    id: v.id, fromYmd: ymdInTz(v.effectiveFrom, tz), kind: v.kind === "fixed" ? "fixed" : "percent",
    rate: v.rate?.toString() ?? null, fixedAmount: v.fixedAmount?.toString() ?? null,
    allIncome: v.allIncome, sources: v.sources, minAmount: v.minAmount?.toString() ?? null, maxAmount: v.maxAmount?.toString() ?? null,
  };
}

export function toRuleInput(rule: RuleRow, tz: string, after?: RuleRow | null): RuleInput {
  return {
    id: rule.id, name: rule.name,
    startsYmd: ymdInTz(rule.startsOn, tz),
    endsYmd: rule.endsOn ? ymdInTz(rule.endsOn, tz) : null,
    versions: rule.versions.map((v) => toVersionInput(v, tz)),
    after: after ? toRuleInput(after, tz, null) : null,
  };
}

const RULE_INCLUDE = { versions: { orderBy: [{ effectiveFrom: "asc" as const }, { createdAt: "asc" as const }] } };

async function loadRules(client: Client, churchId: string, ids?: string[]) {
  const rules = await client.levyRule.findMany({ where: { churchId, ...(ids ? { id: { in: ids } } : {}) }, include: RULE_INCLUDE });
  const afterIds = rules.map((r) => r.afterRuleId).filter((x): x is string => !!x && !rules.some((r) => r.id === x));
  const extra = afterIds.length ? await client.levyRule.findMany({ where: { churchId, id: { in: afterIds } }, include: RULE_INCLUDE }) : [];
  const byId = new Map([...rules, ...extra].map((r) => [r.id, r]));
  return { rules, byId };
}

export async function fundNames(client: Client, churchId: string): Promise<Map<string, string>> {
  const funds = await client.fund.findMany({ where: { churchId }, select: { id: true, name: true } });
  return new Map(funds.map((f) => [f.id, f.name]));
}

/* ───────── Income ───────── */

/**
 * Daily income per stream in [from, to), bucketed by the church's local day. Gifts by fund (received money counts even
 * before it is banked), plus other income posted to the accounts by label. Transfers between the church's own accounts
 * never count, and labels that only ever hold money going out (manual expense entries) are left out.
 */
export async function loadDailyIncome(client: Client, churchId: string, from: Date, to: Date, tz: string): Promise<DailyIncome> {
  const zone = safeTz(tz);
  const f = from.toISOString();
  const t = to.toISOString();
  const [gifts, txns] = await Promise.all([
    client.$queryRaw<{ k: string | null; d: string; s: string }[]>`
      SELECT "fundId" AS k, to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS d, SUM("amount")::text AS s
      FROM "Gift"
      WHERE "churchId" = ${churchId} AND "date" >= (${f}::timestamptz AT TIME ZONE 'UTC') AND "date" < (${t}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, 2`,
    client.$queryRaw<{ k: string | null; d: string; s: string; pos: boolean }[]>`
      SELECT COALESCE(NULLIF("fund", ''), "category") AS k, to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS d,
             SUM("amount")::text AS s, BOOL_OR("amount" > 0) AS pos
      FROM "Transaction"
      WHERE "churchId" = ${churchId} AND "date" >= (${f}::timestamptz AT TIME ZONE 'UTC') AND "date" < (${t}::timestamptz AT TIME ZONE 'UTC')
        AND "category" <> ALL(${EXCLUDED_CATEGORIES}::text[]) AND "amount" <> 0
      GROUP BY 1, 2`,
  ]);
  const out: DailyIncome = new Map();
  const add = (k: StreamKey, d: string, cents: bigint) => {
    const days = out.get(k) ?? new Map<string, bigint>();
    days.set(d, (days.get(d) ?? ZERO) + cents);
    out.set(k, days);
  };
  for (const g of gifts) add(streamKeyForGift(g.k), g.d, toCents(g.s));
  const incomeLabels = new Set(txns.filter((r) => r.pos).map((r) => r.k));
  for (const r of txns) if (r.k && incomeLabels.has(r.k)) add(`ledger:${r.k}`, r.d, toCents(r.s));
  return out;
}

/** Total per stream over a range, for the wizard ("Tithes, GH₵36,200 in the last 3 months"). */
export function totalsByStream(income: DailyIncome): Map<StreamKey, bigint> {
  const m = new Map<StreamKey, bigint>();
  for (const [k, days] of income) {
    let s = ZERO;
    for (const c of days.values()) s += c;
    m.set(k, s);
  }
  return m;
}

/* ───────── Breakdown stored on a record ───────── */

export interface BreakdownLine {
  kind: "percent" | "fixed"; stream: string | null; label: string; fromYmd: string; toYmd: string;
  income: string; after: string; base: string; rateUnits: string; levy: string; versionId: string; partial: boolean; text: string;
}
export interface Breakdown {
  v: 1; period: string; lines: BreakdownLine[]; raw: string; calculated: string;
  cap: string | null; warnings: string[]; afterName: string | null; versionIds: string[];
}

export function toBreakdown(c: LevyComputation, period: string, afterName: string | null): Breakdown {
  return {
    v: 1, period,
    lines: c.lines.map((l) => ({
      kind: l.kind, stream: l.stream, label: l.label, fromYmd: l.fromYmd, toYmd: l.toYmd,
      income: fromCents(l.incomeCents), after: fromCents(l.afterCents), base: fromCents(l.baseCents),
      rateUnits: l.rateUnits.toString(), levy: fromCents(l.levyCents), versionId: l.versionId, partial: l.partial,
      text: explainLine(l, afterName, period),
    })),
    raw: fromCents(c.rawCents), calculated: fromCents(c.calculatedCents), cap: explainCap(c), warnings: c.warnings, afterName, versionIds: c.versionIds,
  };
}

/* ───────── Records ───────── */

/**
 * Make sure every levy has a record for every period from its start (at most 24 months back) up to and including the
 * current one. Safe to run any number of times and at the same time: the (rule, period) pair is unique.
 */
export async function ensureRecords(client: Client, churchId: string, now = new Date()): Promise<number> {
  const tz = await churchTz(client, churchId);
  const today = ymdInTz(now, tz);
  const floor = addMonthsYmd(today, -24);
  const rules = await client.levyRule.findMany({ where: { churchId }, select: { id: true, active: true, startsOn: true, endsOn: true, frequency: true, yearStartMonth: true, dueDays: true } });
  const rows: Prisma.LevyRecordCreateManyInput[] = [];
  for (const r of rules) {
    if (!r.active && !r.endsOn) continue;
    const freq = asFreq(r.frequency);
    const starts = ymdInTz(r.startsOn, tz);
    const from = starts > floor ? starts : floor;
    const lastCounted = r.endsOn ? addDays(ymdInTz(r.endsOn, tz), -1) : today;
    const to = lastCounted < today ? lastCounted : today;
    for (const p of periodsBetween(from, to, freq, r.yearStartMonth)) {
      rows.push({
        churchId, ruleId: r.id, periodKey: p.key,
        periodStart: dayStart(p.startYmd, tz), periodEnd: dayStart(p.endYmd, tz),
        dueDate: dayStart(dueYmdFor(p.endYmd, r.dueDays), tz),
      });
    }
  }
  if (!rows.length) return 0;
  const res = await client.levyRecord.createMany({ data: rows, skipDuplicates: true });
  return res.count;
}

type RecordForCalc = { id: string; ruleId: string; periodKey: string; periodStart: Date; periodEnd: Date; calculated: Prisma.Decimal; driftAccepted: Prisma.Decimal; driftAmount: Prisma.Decimal; state: string };

/** Compute what a set of records would be right now (open or closed), with one income load. */
async function computeMany(client: Client, churchId: string, records: RecordForCalc[], tz: string) {
  const out = new Map<string, { comp: LevyComputation; breakdown: Breakdown }>();
  if (!records.length) return out;
  const { byId } = await loadRules(client, churchId, [...new Set(records.map((r) => r.ruleId))]);
  const names = await fundNames(client, churchId);
  const label = (k: StreamKey) => streamLabel(k, names);
  const from = new Date(Math.min(...records.map((r) => r.periodStart.getTime())));
  const to = new Date(Math.max(...records.map((r) => r.periodEnd.getTime())));
  const income = await loadDailyIncome(client, churchId, from, to, tz);
  for (const rec of records) {
    const rule = byId.get(rec.ruleId);
    if (!rule) continue;
    const after = rule.afterRuleId ? byId.get(rule.afterRuleId) ?? null : null;
    const freq = asFreq(rule.frequency);
    const window = periodBoundsYmd(rec.periodKey, freq, rule.yearStartMonth);
    const comp = computeLevy({ period: window, rule: toRuleInput(rule, tz, after), income, label });
    out.set(rec.id, { comp, breakdown: toBreakdown(comp, periodLabel(rec.periodKey, freq, rule.yearStartMonth), after?.name ?? null) });
  }
  return out;
}

const RECORD_CALC_SELECT = { id: true, ruleId: true, periodKey: true, periodStart: true, periodEnd: true, calculated: true, driftAccepted: true, driftAmount: true, state: true } as const;

/**
 * Recalculate open records. Closed records are never touched. The update itself also checks the record is still open,
 * so a period closed a moment earlier keeps its frozen figures.
 */
export async function recalcOpen(
  client: Client, churchId: string,
  opts: { now?: Date; year?: number; recordIds?: string[]; ruleIds?: string[]; staleMs?: number } = {},
): Promise<{ checked: number; changed: number; beforeCents: bigint; afterCents: bigint }> {
  const tz = await churchTz(client, churchId);
  const now = opts.now ?? new Date();
  const where: Prisma.LevyRecordWhereInput = { churchId, state: "open" };
  if (opts.recordIds) where.id = { in: opts.recordIds };
  if (opts.ruleIds) where.ruleId = { in: opts.ruleIds };
  if (opts.year) where.periodStart = { gte: dayStart(`${opts.year}-01-01`, tz), lt: dayStart(`${opts.year + 1}-01-01`, tz) };
  if (opts.staleMs) where.OR = [{ calculatedAt: null }, { calculatedAt: { lt: new Date(now.getTime() - opts.staleMs) } }];
  const records = await client.levyRecord.findMany({ where, select: RECORD_CALC_SELECT });
  const computed = await computeMany(client, churchId, records, tz);
  let changed = 0;
  let beforeCents = ZERO;
  let afterCents = ZERO;
  for (const rec of records) {
    const c = computed.get(rec.id);
    if (!c) continue;
    const before = toCents(rec.calculated.toString());
    beforeCents += before;
    afterCents += c.comp.calculatedCents;
    if (before !== c.comp.calculatedCents) changed++;
    const calc = fromCents(c.comp.calculatedCents);
    const base = fromCents(c.comp.incomeBaseCents);
    await client.$executeRaw`
      UPDATE "LevyRecord"
      SET "calculated" = ${calc}::numeric, "incomeBase" = ${base}::numeric, "breakdown" = ${JSON.stringify(c.breakdown)}::jsonb,
          "amountDue" = ${calc}::numeric + "adjustments",
          "calculatedAt" = (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC'), "updatedAt" = (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      WHERE "id" = ${rec.id} AND "state" = 'open'`;
  }
  return { checked: records.length, changed, beforeCents, afterCents };
}

/**
 * For closed periods: how far the levy would now differ because giving was added, removed or backdated after closing.
 * Stored as driftAmount (net of differences already dealt with). The closed figures are never rewritten.
 */
export async function checkDrift(client: Client, churchId: string, now = new Date()): Promise<number> {
  const tz = await churchTz(client, churchId);
  const floor = dayStart(addMonthsYmd(ymdInTz(now, tz), -24), tz);
  const records = await client.levyRecord.findMany({ where: { churchId, state: "closed", periodStart: { gte: floor } }, select: RECORD_CALC_SELECT });
  const computed = await computeMany(client, churchId, records, tz);
  let flagged = 0;
  for (const rec of records) {
    const c = computed.get(rec.id);
    if (!c) continue;
    const drift = c.comp.calculatedCents - toCents(rec.calculated.toString()) - toCents(rec.driftAccepted.toString());
    if (drift !== ZERO) flagged++;
    if (drift !== toCents(rec.driftAmount.toString())) {
      await client.levyRecord.update({ where: { id: rec.id }, data: { driftAmount: fromCents(drift) } });
    }
  }
  return flagged;
}

/** What one record would be if worked out again now (used to show drift and previews). */
export async function liveFigure(client: Client, churchId: string, recordId: string) {
  const tz = await churchTz(client, churchId);
  const rec = await client.levyRecord.findFirst({ where: { id: recordId, churchId }, select: RECORD_CALC_SELECT });
  if (!rec) return null;
  return (await computeMany(client, churchId, [rec], tz)).get(rec.id) ?? null;
}

/* ───────── Totals kept on a record ───────── */

async function lockRecord(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "LevyRecord" WHERE "id" = ${id} FOR UPDATE`;
}

/** Re-add payments and adjustments from their rows (never a blind increment). Call inside the transaction that changed them. */
export async function refreshTotals(tx: Prisma.TransactionClient, recordId: string) {
  const [paid, adj, rec] = await Promise.all([
    tx.levyPayment.aggregate({ where: { recordId }, _sum: { amount: true } }),
    tx.levyAdjustment.aggregate({ where: { recordId }, _sum: { amount: true } }),
    tx.levyRecord.findUniqueOrThrow({ where: { id: recordId }, select: { calculated: true } }),
  ]);
  const paidC = toCents(paid._sum.amount?.toString() ?? "0");
  const adjC = toCents(adj._sum.amount?.toString() ?? "0");
  const dueC = toCents(rec.calculated.toString()) + adjC;
  return tx.levyRecord.update({
    where: { id: recordId },
    data: { amountPaid: fromCents(paidC), adjustments: fromCents(adjC), amountDue: fromCents(dueC) },
    select: { id: true, state: true, periodEnd: true, amountDue: true, amountPaid: true },
  });
}

/** Close a period by itself once it has ended and is fully paid (when the church has that switched on). */
export async function maybeAutoClose(tx: Prisma.TransactionClient, recordId: string, opts: { autoClose: boolean; now: Date; tz: string }) {
  if (!opts.autoClose) return false;
  const r = await tx.levyRecord.findUnique({ where: { id: recordId }, select: { state: true, periodEnd: true, amountDue: true, amountPaid: true } });
  if (!r || r.state !== "open") return false;
  if (ymdInTz(opts.now, opts.tz) < ymdInTz(r.periodEnd, opts.tz)) return false;
  const due = toCents(r.amountDue.toString());
  if (due <= ZERO || toCents(r.amountPaid.toString()) < due) return false;
  await tx.levyRecord.update({ where: { id: recordId }, data: { state: "closed", closedAt: opts.now, closedByName: "Closed by itself once fully paid", driftAmount: 0 } });
  return true;
}

/* ───────── Closing and reopening ───────── */

/** Freeze periods: recalculated one last time, then closed. Periods still counting are refused. */
export async function closeRecords(client: Client, churchId: string, ids: string[], by: { id: string | null; name: string }, now = new Date()) {
  const tz = await churchTz(client, churchId);
  const today = ymdInTz(now, tz);
  const recs = await client.levyRecord.findMany({ where: { churchId, id: { in: ids }, state: "open" }, select: { id: true, periodEnd: true } });
  const ready = recs.filter((r) => ymdInTz(r.periodEnd, tz) <= today).map((r) => r.id);
  if (ready.length) await recalcOpen(client, churchId, { now, recordIds: ready });
  const res = await client.levyRecord.updateMany({
    where: { churchId, id: { in: ready }, state: "open" },
    data: { state: "closed", closedAt: now, closedById: by.id, closedByName: by.name, driftAmount: 0, driftAccepted: 0 },
  });
  return { closed: res.count, stillCounting: recs.length - ready.length };
}

export async function reopenRecord(client: Client, churchId: string, recordId: string) {
  const res = await client.levyRecord.updateMany({
    where: { id: recordId, churchId, state: "closed" },
    data: { state: "open", closedAt: null, closedById: null, closedByName: null, driftAmount: 0, driftAccepted: 0 },
  });
  if (res.count) await recalcOpen(client, churchId, { recordIds: [recordId] });
  return res.count > 0;
}

/* ───────── Payments ───────── */

export interface PaymentInput {
  churchId: string;
  recordId: string;
  amountCents: bigint;
  paidOn: Date;
  method: string;
  reference: string | null;
  /** Already checked to belong to the church. */
  accountId: string | null;
  createExpense: boolean;
  expense?: { description: string; vendor: string };
  proof?: { key: string; name: string | null; type: string | null } | null;
  note: string | null;
  by: { id: string | null; name: string };
  autoClose: boolean;
  tz: string;
  now?: Date;
}

/** Record a payment (and its expense) in one transaction, then re-add what has been paid and close the period if it is done. */
export async function insertPayment(client: PrismaClient, input: PaymentInput) {
  if (input.amountCents <= ZERO) throw new Error("Enter an amount above zero.");
  const now = input.now ?? new Date();
  return client.$transaction(async (tx) => {
    await lockRecord(tx, input.recordId);
    const rec = await tx.levyRecord.findFirst({ where: { id: input.recordId, churchId: input.churchId }, select: { id: true } });
    if (!rec) throw new Error("That levy period could not be found.");
    let expenseId: string | null = null;
    if (input.createExpense) {
      const e = await tx.expense.create({
        data: {
          churchId: input.churchId, description: input.expense?.description ?? "Levy payment", category: EXPENSE_CATEGORY,
          amount: centsToNumber(input.amountCents), vendor: input.expense?.vendor ?? null, receiptRef: input.reference,
          approvedBy: input.by.name, accountId: input.accountId, date: input.paidOn,
        },
        select: { id: true },
      });
      expenseId = e.id;
    }
    const p = await tx.levyPayment.create({
      data: {
        churchId: input.churchId, recordId: input.recordId, amount: fromCents(input.amountCents), paidOn: input.paidOn,
        method: input.method, reference: input.reference, accountId: input.accountId, expenseId,
        proofKey: input.proof?.key ?? null, proofName: input.proof?.name ?? null, proofType: input.proof?.type ?? null,
        note: input.note, recordedById: input.by.id, recordedByName: input.by.name,
      },
      select: { id: true },
    });
    const totals = await refreshTotals(tx, input.recordId);
    const closed = await maybeAutoClose(tx, input.recordId, { autoClose: input.autoClose, now, tz: input.tz });
    return { paymentId: p.id, expenseId, closed, amountPaid: totals.amountPaid.toString(), amountDue: totals.amountDue.toString() };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** Remove a payment and the expense it created, then re-add what has been paid. */
export async function removePayment(client: PrismaClient, churchId: string, paymentId: string) {
  return client.$transaction(async (tx) => {
    const p = await tx.levyPayment.findFirst({ where: { id: paymentId, churchId } });
    if (!p) return null;
    await lockRecord(tx, p.recordId);
    await tx.levyPayment.delete({ where: { id: p.id } });
    if (p.expenseId) await tx.expense.deleteMany({ where: { id: p.expenseId, churchId } });
    await refreshTotals(tx, p.recordId);
    return p;
  }, { maxWait: 10_000, timeout: 20_000 });
}

/* ───────── Adjustments ───────── */

export type AdjustmentKind = "manual" | "income_change" | "carry_credit" | "waiver";

export async function applyAdjustment(
  client: PrismaClient,
  input: { churchId: string; recordId: string; amountCents: bigint; kind: AdjustmentKind; reason: string; fromRecordId?: string | null; by: { id: string | null; name: string }; allowClosed?: boolean },
) {
  if (input.amountCents === ZERO) throw new Error("The adjustment is zero.");
  return client.$transaction(async (tx) => {
    await lockRecord(tx, input.recordId);
    const rec = await tx.levyRecord.findFirst({ where: { id: input.recordId, churchId: input.churchId }, select: { state: true } });
    if (!rec) throw new Error("That levy period could not be found.");
    if (rec.state === "closed" && !input.allowClosed) throw new Error("This period is closed. Add the adjustment to the next open period instead.");
    await tx.levyAdjustment.create({
      data: {
        churchId: input.churchId, recordId: input.recordId, amount: fromCents(input.amountCents), kind: input.kind,
        reason: input.reason.slice(0, 300), fromRecordId: input.fromRecordId ?? null, createdById: input.by.id, createdByName: input.by.name,
      },
    });
    return refreshTotals(tx, input.recordId);
  });
}

/** The next open period of the same levy after this one, where a difference or a credit can go. */
export async function nextOpenRecord(client: Client, churchId: string, recordId: string) {
  const rec = await client.levyRecord.findFirst({ where: { id: recordId, churchId }, select: { ruleId: true, periodStart: true } });
  if (!rec) return null;
  return client.levyRecord.findFirst({
    where: { churchId, ruleId: rec.ruleId, state: "open", periodStart: { gt: rec.periodStart } },
    orderBy: { periodStart: "asc" },
    select: { id: true, periodKey: true, rule: { select: { frequency: true, yearStartMonth: true } } },
  });
}

/** Deal with a closed period whose levy has changed: carry the difference to the next open period, or leave it. */
export async function acceptDrift(client: PrismaClient, input: { churchId: string; recordId: string; mode: "carry" | "ignore"; reason: string; by: { id: string | null; name: string } }) {
  const rec = await client.levyRecord.findFirst({ where: { id: input.recordId, churchId: input.churchId, state: "closed" }, select: { id: true, driftAmount: true, driftAccepted: true, periodKey: true } });
  if (!rec) throw new Error("That closed period could not be found.");
  const drift = toCents(rec.driftAmount.toString());
  if (drift === ZERO) return { carried: ZERO, to: null as string | null };
  let to: string | null = null;
  if (input.mode === "carry") {
    const next = await nextOpenRecord(client, input.churchId, rec.id);
    if (!next) throw new Error("There is no open period after this one yet to carry it to.");
    await applyAdjustment(client, { churchId: input.churchId, recordId: next.id, amountCents: drift, kind: "income_change", reason: input.reason, fromRecordId: rec.id, by: input.by });
    to = periodLabel(next.periodKey, asFreq(next.rule.frequency), next.rule.yearStartMonth);
  }
  await client.levyRecord.update({
    where: { id: rec.id },
    data: { driftAccepted: fromCents(toCents(rec.driftAccepted.toString()) + drift), driftAmount: 0 },
  });
  return { carried: drift, to };
}

/** Move what was paid over the amount due to the next open period. */
export async function carryCredit(client: PrismaClient, input: { churchId: string; recordId: string; by: { id: string | null; name: string } }) {
  const rec = await client.levyRecord.findFirst({ where: { id: input.recordId, churchId: input.churchId }, select: { amountDue: true, amountPaid: true, periodKey: true, rule: { select: { frequency: true, yearStartMonth: true } } } });
  if (!rec) throw new Error("That levy period could not be found.");
  const credit = toCents(rec.amountPaid.toString()) - toCents(rec.amountDue.toString());
  if (credit <= ZERO) throw new Error("Nothing was paid over the amount due.");
  const next = await nextOpenRecord(client, input.churchId, input.recordId);
  if (!next) throw new Error("There is no open period after this one yet to carry the extra to.");
  const fromLabel = periodLabel(rec.periodKey, asFreq(rec.rule.frequency), rec.rule.yearStartMonth);
  const toLabel = periodLabel(next.periodKey, asFreq(next.rule.frequency), next.rule.yearStartMonth);
  await applyAdjustment(client, { churchId: input.churchId, recordId: input.recordId, amountCents: credit, kind: "carry_credit", reason: `${fmtGhs(credit)} extra moved to ${toLabel}`, fromRecordId: next.id, by: input.by, allowClosed: true });
  await applyAdjustment(client, { churchId: input.churchId, recordId: next.id, amountCents: -credit, kind: "carry_credit", reason: `${fmtGhs(credit)} paid extra in ${fromLabel}`, fromRecordId: input.recordId, by: input.by });
  return { credit, to: toLabel };
}

/* ───────── Rule validation shared with the action ───────── */

/** Refuse a new version that would start inside a closed period of this levy. */
export async function effectiveFromProblem(client: Client, churchId: string, ruleId: string, fromYmd: string, tz: string): Promise<string | null> {
  const closed = await client.levyRecord.findMany({
    where: { churchId, ruleId, state: "closed" },
    select: { periodKey: true, periodEnd: true, rule: { select: { frequency: true, yearStartMonth: true } } },
  });
  return checkEffectiveFrom(fromYmd, closed.map((c) => {
    const endYmd = ymdInTz(c.periodEnd, tz);
    const last = addDays(endYmd, -1);
    return { endYmd, label: periodLabel(c.periodKey, asFreq(c.rule.frequency), c.rule.yearStartMonth), lastDayLabel: longDate(last).replace(/ \d{4}$/, "") };
  }));
}

/** The last full period before today, for previews ("Last month this would have been..."). */
export function lastFullPeriod(todayYmd: string, freq: Frequency, yearStartMonth: number) {
  const current = periodBoundsYmd(periodKeyFor(todayYmd, freq, yearStartMonth), freq, yearStartMonth);
  const prevKey = periodKeyFor(addDays(current.startYmd, -1), freq, yearStartMonth);
  return { ...periodBoundsYmd(prevKey, freq, yearStartMonth), label: periodLabel(prevKey, freq, yearStartMonth) };
}
