import "server-only";
import { db } from "@/lib/db";
import { r2Ready } from "@/lib/storage";
import { ymdInTz } from "@/lib/time/tz";
import { fundKind } from "@/lib/giving/channels";
import { getAccountOptions } from "@/lib/data/accounts";
import { statusOf, retentionByStream, versionOn } from "@/lib/levies/calc";
import { statusText, METHOD_LABELS } from "@/lib/levies/explain";
import { ZERO, toCents, centsToNumber, fmtGhs, fmtRate, rateUnits, RATE_DIV } from "@/lib/levies/money";
import { addDays, addMonthsYmd, dayStart, periodLabel, periodShort, MONTH_SHORT } from "@/lib/levies/periods";
import { streamLabel, GENERAL_GIVING } from "@/lib/levies/streams";
import { ensureRecords, recalcOpen, checkDrift, loadDailyIncome, totalsByStream, safeTz, STALE_MS, toVersionInput, type Breakdown } from "@/lib/levies/engine";
import type { Frequency, LevyStatus } from "@/lib/levies/types";
import type {
  LeviesPageData, RuleView, VersionView, RecordView, PaymentView, ScheduleItem, BranchChild, StreamOption,
} from "@/lib/levies/view-types";
import type { Prisma } from "@prisma/client";

const asFreq = (f: string): Frequency => (f === "quarterly" || f === "yearly" ? f : "monthly");
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? 0 : centsToNumber(toCents(d.toString())));
const FREQ_WORD: Record<Frequency, string> = { monthly: "month", quarterly: "quarter", yearly: "year" };
export const PAYMENT_PAGE = 25;

export function dueText(dueDays: number, freq: Frequency) {
  return dueDays === 0 ? `Due on the last day of each ${FREQ_WORD[freq]}` : `Due ${dueDays} day${dueDays === 1 ? "" : "s"} after each ${FREQ_WORD[freq]} ends`;
}

function versionSummary(v: { kind: string; rate: string | null; fixedAmount: string | null; allIncome: boolean }, labels: string[], freq: Frequency): string {
  if (v.kind === "fixed") return `${fmtGhs(toCents(v.fixedAmount))} each ${FREQ_WORD[freq]}`;
  const of = v.allIncome ? "all income" : labels.length ? labels.join(", ").replace(/, ([^,]*)$/, " and $1") : "no income chosen yet";
  return `${fmtRate(rateUnits(v.rate))} of ${of}`;
}

export function parseSchedule(json: unknown): ScheduleItem[] {
  if (!Array.isArray(json)) return [];
  return json.slice(0, 20).flatMap((x): ScheduleItem[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const kind = o.kind === "fixed" ? "fixed" : "percent";
    const freq = asFreq(String(o.frequency ?? "monthly"));
    const hint = ["tithes", "offertory", "tithes_offertory", "all"].includes(String(o.sourceHint)) ? (o.sourceHint as ScheduleItem["sourceHint"]) : null;
    const name = String(o.name ?? "").slice(0, 80);
    if (!name) return [];
    return [{
      name, payee: String(o.payee ?? "").slice(0, 80), kind,
      rate: kind === "percent" && Number.isFinite(Number(o.rate)) ? Number(o.rate) : null,
      fixedAmount: kind === "fixed" && Number.isFinite(Number(o.fixedAmount)) ? Number(o.fixedAmount) : null,
      frequency: freq, dueDays: Math.max(0, Math.min(120, Math.round(Number(o.dueDays ?? 15)) || 0)), sourceHint: hint,
      note: o.note ? String(o.note).slice(0, 200) : null,
    }];
  });
}

/** Status of a record from its stored figures, judged on the church's local day. */
function statusFor(r: { periodEnd: Date; dueDate: Date; amountDue: Prisma.Decimal; amountPaid: Prisma.Decimal }, tz: string, today: string, waived: boolean) {
  const endYmd = ymdInTz(r.periodEnd, tz);
  const dueYmd = ymdInTz(r.dueDate, tz);
  const s = statusOf({ todayYmd: today, endYmd, dueYmd, dueCents: toCents(r.amountDue.toString()), paidCents: toCents(r.amountPaid.toString()), waived });
  return { ...s, endYmd, dueYmd };
}

type PaymentRow = {
  id: string; recordId: string; paidOn: Date; amount: Prisma.Decimal; method: string; reference: string | null; note: string | null;
  proofKey: string | null; proofName: string | null; proofType: string | null; expenseId: string | null; recordedByName: string | null;
  parentConfirmedAt: Date | null; parentConfirmedByName: string | null;
};
function paymentView(p: PaymentRow, tz: string, extra?: { ruleName?: string; periodLabel?: string }): PaymentView {
  return {
    id: p.id, recordId: p.recordId, paidOnYmd: ymdInTz(p.paidOn, tz), amount: num(p.amount), method: p.method, reference: p.reference, note: p.note,
    hasProof: !!p.proofKey, proofName: p.proofName, proofType: p.proofType, expenseId: p.expenseId, recordedByName: p.recordedByName,
    confirmedBy: p.parentConfirmedAt ? p.parentConfirmedByName : null, confirmedAt: p.parentConfirmedAt?.toISOString() ?? null, ...extra,
  };
}

/** Bring a church's levy records up to date: create missing periods, refresh stale open ones, flag changed closed ones. */
export async function syncLevies(churchId: string, opts: { year?: number; force?: boolean } = {}) {
  await ensureRecords(db, churchId);
  await recalcOpen(db, churchId, { year: opts.year, staleMs: opts.force ? undefined : STALE_MS });
  await checkDrift(db, churchId);
}

/** Everything the Levies screen shows for one year. */
export async function getLeviesPage(churchId: string, year: number, access: LeviesPageData["access"], opts: { sync?: boolean } = {}): Promise<LeviesPageData> {
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: {
      name: true, timezone: true, levyRemindOn: true, levyRemindDays: true, levyRemindSms: true, levyRemindUserIds: true, levyAutoClose: true, levySchedule: true,
      parentChurch: { select: { id: true, name: true, levySchedule: true } }, linkShare: true,
      _count: { select: { linkedChurches: true } },
    },
  });
  if (!church) throw new Error("Church not found");
  const tz = safeTz(church.timezone);
  const now = new Date();
  const today = ymdInTz(now, tz);
  const thisYear = Number(today.slice(0, 4));
  if (opts.sync !== false) {
    try { await syncLevies(churchId, { year }); } catch (e) { console.error("[levies] sync failed", e); }
  }

  const yearStart = dayStart(`${year}-01-01`, tz);
  const yearEnd = dayStart(`${year + 1}-01-01`, tz);
  const [rules, funds, records, changes, team, accounts, payments, paymentTotal] = await Promise.all([
    db.levyRule.findMany({
      where: { churchId },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: { versions: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] }, afterRule: { select: { name: true } }, records: { where: { OR: [{ state: "closed" }, { payments: { some: {} } }] }, select: { id: true, amountPaid: true }, take: 1 } },
    }),
    db.fund.findMany({ where: { churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.levyRecord.findMany({
      // This year's periods, plus any older one still owing so nothing overdue is hidden.
      where: { churchId, OR: [{ periodStart: { gte: yearStart, lt: yearEnd } }, { periodStart: { lt: yearStart }, state: "open" }] },
      orderBy: [{ periodStart: "desc" }],
      include: {
        rule: { select: { name: true, payee: true, frequency: true, yearStartMonth: true } },
        payments: { orderBy: { paidOn: "asc" } },
        adjustmentRows: { orderBy: { createdAt: "asc" } },
      },
    }),
    db.levyRuleChange.findMany({ where: { churchId }, orderBy: { createdAt: "desc" }, take: 80 }),
    db.user.findMany({ where: { churchId }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    getAccountOptions(churchId),
    db.levyPayment.findMany({ where: { churchId }, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], take: PAYMENT_PAGE, include: { record: { select: { periodKey: true, rule: { select: { name: true, frequency: true, yearStartMonth: true } } } } } }),
    db.levyPayment.count({ where: { churchId } }),
  ]);
  const names = new Map(funds.map((f) => [f.id, f.name]));
  const label = (k: string) => streamLabel(k, names);

  // Income: this year for "You keep", the last 3 full months for the wizard.
  const threeFrom = dayStart(`${addMonthsYmd(today, -3).slice(0, 8)}01`, tz);
  const [yearIncome, recentIncome] = await Promise.all([
    loadDailyIncome(db, churchId, yearStart, yearEnd, tz),
    loadDailyIncome(db, churchId, threeFrom, dayStart(`${today.slice(0, 8)}01`, tz), tz),
  ]);
  const recent = totalsByStream(recentIncome);
  const yearTotals = totalsByStream(yearIncome);
  const streamKeys = new Set<string>([...funds.map((f) => `fund:${f.id}`), GENERAL_GIVING, ...recent.keys(), ...yearTotals.keys()]);
  for (const r of rules) for (const v of r.versions) for (const s of v.sources) streamKeys.add(s);
  const streams: StreamOption[] = [...streamKeys].map((key) => ({
    key, label: label(key), last3: centsToNumber(recent.get(key) ?? ZERO),
    kind: key.startsWith("fund:") && key !== GENERAL_GIVING ? fundKind(names.get(key.slice(5))) : "other",
  })).sort((a, b) => b.last3 - a.last3 || a.label.localeCompare(b.label));

  // Rules
  const ruleViews: RuleView[] = rules.map((r) => {
    const freq = asFreq(r.frequency);
    const versions: VersionView[] = r.versions.map((v) => {
      const vi = toVersionInput(v, tz);
      const sourceLabels = v.sources.map(label);
      return {
        id: v.id, fromYmd: vi.fromYmd, kind: vi.kind, rate: v.rate ? Number(v.rate) : null, fixedAmount: v.fixedAmount ? Number(v.fixedAmount) : null,
        allIncome: v.allIncome, sources: v.sources, sourceLabels, minAmount: v.minAmount ? Number(v.minAmount) : null, maxAmount: v.maxAmount ? Number(v.maxAmount) : null,
        summary: versionSummary({ kind: v.kind, rate: v.rate?.toString() ?? null, fixedAmount: v.fixedAmount?.toString() ?? null, allIncome: v.allIncome }, sourceLabels, freq),
        byName: v.createdByName,
      };
    });
    const cur = versions.filter((v) => v.fromYmd <= today).pop() ?? versions[0] ?? null;
    return {
      id: r.id, name: r.name, payee: r.payee, payeeKind: r.payeeKind, payeeChurchId: r.payeeChurchId, frequency: freq, yearStartMonth: r.yearStartMonth,
      dueDays: r.dueDays, startsYmd: ymdInTz(r.startsOn, tz), endsYmd: r.endsOn ? ymdInTz(r.endsOn, tz) : null, active: r.active,
      afterRuleId: r.afterRuleId, afterName: r.afterRule?.name ?? null, notes: r.notes,
      current: cur, versions,
      scheduleLocked: r.records.length > 0, hasPayments: r.records.some((x) => toCents(x.amountPaid.toString()) > ZERO),
      dueText: dueText(r.dueDays, freq),
    };
  });

  // Records
  const recordViews: RecordView[] = records.map((r) => {
    const freq = asFreq(r.rule.frequency);
    const waived = r.adjustmentRows.some((a) => a.kind === "waiver");
    const s = statusFor(r, tz, today, waived);
    const bd = (r.breakdown ?? null) as Breakdown | null;
    const explanation = bd?.lines?.length ? [...bd.lines.map((l) => l.text), ...(bd.cap ? [bd.cap] : [])] : ["Nothing to charge for this period."];
    return {
      id: r.id, ruleId: r.ruleId, ruleName: r.rule.name, payee: r.rule.payee, periodKey: r.periodKey,
      label: periodLabel(r.periodKey, freq, r.rule.yearStartMonth), short: periodShort(r.periodKey, freq), frequency: freq,
      startYmd: ymdInTz(r.periodStart, tz), endYmd: s.endYmd, dueYmd: s.dueYmd, state: r.state === "closed" ? "closed" : "open",
      status: s.status, statusText: statusText(s.status, { dueYmd: s.dueYmd, partPaid: s.partPaid, thisYear }), overdue: s.overdue, partPaid: s.partPaid,
      calculated: num(r.calculated), adjustmentsTotal: num(r.adjustments), due: num(r.amountDue), paid: num(r.amountPaid), left: centsToNumber(s.leftCents),
      incomeBase: num(r.incomeBase), explanation, breakdown: bd,
      adjustments: r.adjustmentRows.map((a) => ({ id: a.id, amount: num(a.amount), kind: a.kind, reason: a.reason, byName: a.createdByName, createdAt: a.createdAt.toISOString() })),
      payments: r.payments.map((p) => paymentView(p, tz)),
      closedAt: r.closedAt?.toISOString() ?? null, closedByName: r.closedByName, drift: num(r.driftAmount), calculatedAt: r.calculatedAt?.toISOString() ?? null,
    };
  });

  // Summary
  const live = recordViews.filter((r) => r.status !== "counting");
  const overdue = live.filter((r) => r.overdue);
  const upcoming = live.filter((r) => !r.overdue && r.left > 0).sort((a, b) => (a.dueYmd < b.dueYmd ? -1 : 1));
  const nextDue = upcoming[0]?.dueYmd ?? null;
  const thisYearRecords = recordViews.filter((r) => r.startYmd.startsWith(String(year)));
  const leviesCents = thisYearRecords.reduce((s, r) => s + toCents(r.calculated), ZERO);
  let incomeCents = ZERO;
  for (const [, c] of yearTotals) if (c > ZERO) incomeCents += c;
  const yearPayments = await db.levyPayment.aggregate({ where: { churchId, paidOn: { gte: yearStart, lt: yearEnd } }, _sum: { amount: true } });

  // This period so far: one entry per active rule's current record.
  const current = ruleViews.filter((r) => r.active).flatMap((rule) => {
    const rec = recordViews.find((x) => x.ruleId === rule.id && x.status === "counting");
    if (!rec) return [];
    return [{ label: `${rule.name}, ${rec.label}`, untilYmd: addDays(rec.endYmd, -1), lines: [{ ruleName: rule.name, text: rec.explanation.join(". "), amount: rec.due }] }];
  });

  // 12-month strip for the year: the most urgent status across levies in each month.
  const RANK: Record<LevyStatus | "none", number> = { overdue: 7, part_paid: 6, unpaid: 5, counting: 4, credit: 3, paid: 2, waived: 1, nothing_due: 0, none: -1 };
  const strip = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const monthStart = `${key}-01`;
    const nextStart = addMonthsYmd(monthStart, 1);
    const inMonth = thisYearRecords.filter((r) => r.startYmd < nextStart && r.endYmd > monthStart);
    const status = inMonth.reduce<LevyStatus | "none">((best, r) => (RANK[r.status] > RANK[best] ? r.status : best), "none");
    return { key, label: MONTH_SHORT[i], status, due: inMonth.reduce((s, r) => s + r.due, 0), paid: inMonth.reduce((s, r) => s + r.paid, 0) };
  });

  // Share of each income stream that goes to levies.
  const rateRules = rules.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, afterRuleId: r.afterRuleId, version: versionOn(r.versions.map((v) => toVersionInput(v, tz)), today) }));
  const usedStreams = [...new Set(rateRules.flatMap((r) => (r.version?.kind === "percent" ? (r.version.allIncome ? [...streamKeys] : r.version.sources) : [])))];
  const pct = (u: bigint) => Math.round(Number((u * BigInt(10000)) / RATE_DIV)) / 100;
  const retention = retentionByStream(rateRules, usedStreams)
    .filter((r) => r.shares.length)
    .map((r) => ({ label: label(r.stream), shares: r.shares.map((s) => ({ name: s.name, pct: pct(s.units) })), totalPct: pct(r.totalUnits), keepPct: pct(r.keepUnits) }))
    .sort((a, b) => b.totalPct - a.totalPct);

  const parentSchedule = church.parentChurch ? parseSchedule(church.parentChurch.levySchedule) : [];
  return {
    year, todayYmd: today, tz, churchName: church.name, access,
    settings: { remindOn: church.levyRemindOn, remindDays: church.levyRemindDays, remindSms: church.levyRemindSms, remindUserIds: church.levyRemindUserIds, autoClose: church.levyAutoClose },
    team: team.map((t) => ({ id: t.id, name: t.name, role: t.role })),
    streams, rules: ruleViews, records: recordViews,
    summary: {
      overdueCount: overdue.length, overdueTotal: overdue.reduce((s, r) => s + r.left, 0),
      dueNext: nextDue ? { dueYmd: nextDue, total: upcoming.filter((r) => r.dueYmd === nextDue).reduce((s, r) => s + r.left, 0) } : null,
      paidThisYear: num(yearPayments._sum.amount), incomeThisYear: centsToNumber(incomeCents), leviesThisYear: centsToNumber(leviesCents),
      keepPct: incomeCents > ZERO ? Math.round(Number(((incomeCents - leviesCents) * BigInt(1000)) / incomeCents)) / 10 : null,
      owedNow: live.reduce((s, r) => s + r.left, 0),
    },
    current,
    strip,
    retention,
    changes: changes.map((c) => ({ id: c.id, ruleId: c.ruleId, ruleName: c.ruleName, action: c.action, summary: c.summary, byName: c.byName, createdAt: c.createdAt.toISOString() })),
    accounts,
    parent: church.parentChurch ? { id: church.parentChurch.id, name: church.parentChurch.name, schedule: parentSchedule, shares: church.linkShare.includes("levies") } : null,
    isParent: church._count.linkedChurches > 0,
    ownSchedule: parseSchedule(church.levySchedule),
    payments: {
      rows: payments.map((p) => paymentView(p, tz, { ruleName: p.record.rule.name, periodLabel: periodLabel(p.record.periodKey, asFreq(p.record.rule.frequency), p.record.rule.yearStartMonth) })),
      total: paymentTotal, page: 1,
    },
    r2Ready,
  };
}

/** One page of levy payments for the searchable list. */
export async function queryLevyPayments(churchId: string, search: string, filters: { ruleId?: string; year?: number }, page: number) {
  const c = await db.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  const tz = safeTz(c?.timezone);
  const q = search.trim().slice(0, 60);
  const where: Prisma.LevyPaymentWhereInput = {
    churchId,
    ...(filters.ruleId ? { record: { ruleId: filters.ruleId } } : {}),
    ...(filters.year ? { paidOn: { gte: dayStart(`${filters.year}-01-01`, tz), lt: dayStart(`${filters.year + 1}-01-01`, tz) } } : {}),
    ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }, { record: { rule: { name: { contains: q, mode: "insensitive" } } } }, { record: { rule: { payee: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const p = Math.max(1, Math.floor(page) || 1);
  const [rows, total] = await Promise.all([
    db.levyPayment.findMany({ where, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], skip: (p - 1) * PAYMENT_PAGE, take: PAYMENT_PAGE, include: { record: { select: { periodKey: true, rule: { select: { name: true, frequency: true, yearStartMonth: true } } } } } }),
    db.levyPayment.count({ where }),
  ]);
  return {
    rows: rows.map((r) => paymentView(r, tz, { ruleName: r.record.rule.name, periodLabel: periodLabel(r.record.periodKey, asFreq(r.record.rule.frequency), r.record.rule.yearStartMonth) })),
    total, page: p,
  };
}

/**
 * What each linked church owes this church and has paid, for the Branches tab. Only churches that chose to share levies,
 * and only levies they set up as payable to this church. Totals and payments, never their giving.
 */
export async function getBranchLevies(parentChurchId: string, year: number): Promise<BranchChild[]> {
  const kids = await db.church.findMany({ where: { parentChurchId }, select: { id: true, name: true, linkKind: true, linkShare: true, timezone: true }, orderBy: { name: "asc" } });
  const out: BranchChild[] = [];
  for (const k of kids) {
    const shares = k.linkShare.includes("levies");
    const row: BranchChild = { id: k.id, name: k.name, kind: k.linkKind ?? "partner", shares, owed: 0, paid: 0, overdueCount: 0, overdueTotal: 0, lastPaidOn: null, records: [] };
    if (!shares) { out.push(row); continue; }
    const tz = safeTz(k.timezone);
    const today = ymdInTz(new Date(), tz);
    const thisYear = Number(today.slice(0, 4));
    const recs = await db.levyRecord.findMany({
      where: { churchId: k.id, rule: { payeeChurchId: parentChurchId }, periodStart: { gte: dayStart(`${year}-01-01`, tz), lt: dayStart(`${year + 1}-01-01`, tz) } },
      orderBy: { periodStart: "desc" },
      include: { rule: { select: { name: true, frequency: true, yearStartMonth: true } }, payments: { orderBy: { paidOn: "asc" } }, adjustmentRows: { where: { kind: "waiver" }, select: { id: true } } },
    });
    for (const r of recs) {
      const freq = asFreq(r.rule.frequency);
      const s = statusFor(r, tz, today, r.adjustmentRows.length > 0);
      const due = num(r.amountDue);
      const paid = num(r.amountPaid);
      if (s.status !== "counting") row.owed += due;
      row.paid += paid;
      if (s.overdue) { row.overdueCount++; row.overdueTotal += centsToNumber(s.leftCents); }
      const pays = r.payments.map((p) => paymentView(p, tz));
      for (const p of pays) if (!row.lastPaidOn || p.paidOnYmd > row.lastPaidOn) row.lastPaidOn = p.paidOnYmd;
      row.records.push({
        id: r.id, ruleName: r.rule.name, label: periodLabel(r.periodKey, freq, r.rule.yearStartMonth), short: periodShort(r.periodKey, freq),
        status: s.status, statusText: statusText(s.status, { dueYmd: s.dueYmd, partPaid: s.partPaid, thisYear }), due, paid, left: centsToNumber(s.leftCents), dueYmd: s.dueYmd,
        payments: pays,
      });
    }
    row.owed = Math.round(row.owed * 100) / 100;
    row.paid = Math.round(row.paid * 100) / 100;
    out.push(row);
  }
  return out;
}

export const methodLabel = (m: string) => METHOD_LABELS[m] ?? m;
