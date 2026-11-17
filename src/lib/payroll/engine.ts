/**
 * Staff & Payroll: database work for runs, postings, loans and the payroll trail.
 *
 * No "server-only" import and no global db: every function takes the Prisma client (or a transaction) as its first
 * argument, so the tsx DB test can drive it with its own client. Server actions wrap these in db.$transaction.
 *
 * Every state change is a conditional updateMany on { id, churchId, status, version } and throws StaleRunError when it
 * does not hit exactly one row, so two people clicking at once can never both win.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeLine, fromP, toP, pToNumber, periodKey, periodLabel, inPeriod, type ItemInput, type LineResult, type PayrollRules } from "./calc";
import { freezeRules, pickBandSet, rulesFromJson, canApprove } from "./rules";
import { runWorkingDays, unpaidDaysInMonth, dayKey } from "./leave";
import { maskLabel } from "./mask";
import { NON_RESIDENT_BANDS } from "./defaults";

/** Non-resident staff are taxed through the flat non-resident band, not the resident bands. */
const rulesForStaff = (rules: PayrollRules, taxResident: boolean | null | undefined): PayrollRules =>
  taxResident === false ? { ...rules, bands: NON_RESIDENT_BANDS } : rules;

export type Tx = Prisma.TransactionClient | PrismaClient;
export interface Actor { id: string; name: string }

/** Someone else changed the run first (or it is no longer in the expected status). */
export class StaleRunError extends Error {
  constructor(msg = "This payroll was changed by someone else a moment ago. Refresh the page and try again.") { super(msg); }
}
/** A plain-English refusal for the person (safe to show). */
export class PayrollError extends Error {}

type Dec = { toString(): string } | number | string | null | undefined;
const P = (v: Dec) => toP(v === null || v === undefined ? 0 : typeof v === "number" ? v : v.toString());

// ── Trail ──

export async function writeEvent(tx: Tx, e: { churchId: string; runId?: string | null; staffId?: string | null; action: string; actorId?: string | null; actorName?: string | null; detail?: string; meta?: Prisma.InputJsonValue }) {
  await tx.payrollEvent.create({
    data: {
      churchId: e.churchId, runId: e.runId ?? null, staffId: e.staffId ?? null, action: e.action,
      actorId: e.actorId ?? null, actorName: e.actorName ?? null, detail: e.detail ?? null, meta: e.meta ?? undefined,
    },
  });
}

// ── Settings and rules ──

export async function ensureSettings(tx: Tx, churchId: string) {
  const found = await tx.payrollSettings.findUnique({ where: { churchId } });
  if (found) return found;
  // Churches outside Ghana start with no statutory deductions (decision 13).
  const church = await tx.church.findUnique({ where: { id: churchId }, select: { country: true } });
  const ghana = !church?.country || /ghana/i.test(church.country);
  // ON CONFLICT DO NOTHING: two parts of one page can ask at the same moment on a church's first visit. An upsert
  // would make the second one fail (and abort a surrounding transaction); this way both simply read the one row.
  await tx.payrollSettings.createMany({ data: [{ churchId, statutoryMode: ghana ? "ghana" : "none" }], skipDuplicates: true });
  return tx.payrollSettings.findUniqueOrThrow({ where: { churchId } });
}

export async function rulesFor(tx: Tx, churchId: string, year: number, month: number): Promise<PayrollRules> {
  const [settings, sets] = await Promise.all([
    ensureSettings(tx, churchId),
    tx.payeBandSet.findMany({ where: { churchId }, select: { name: true, effectiveFrom: true, bands: true } }),
  ]);
  return freezeRules(settings, pickBandSet(sets, year, month));
}

/** User ids who may approve payroll: the Main Admin and everyone with payroll manage (portal logins never). */
export async function eligibleManagers(tx: Tx, churchId: string): Promise<string[]> {
  const users = await tx.user.findMany({
    where: { churchId, staffPortalOnly: false, OR: [{ role: "Owner" }, { payrollAccess: "manage" }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ── Building lines ──

const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0, 23, 59, 59));

interface StoredItem {
  kind: string; code: string; label: string; amount: Dec; taxable: boolean; ssnitable: boolean; preTax: boolean; remitted: boolean;
  source: string; payItemId: string | null; loanId: string | null; leaveRequestId: string | null;
}

function lineData(r: LineResult) {
  return {
    basic: fromP(r.basicP), gross: fromP(r.grossP), ssnitBase: fromP(r.ssnitBaseP), taxableIncome: fromP(r.taxableP),
    ssnitEmployee: fromP(r.ssnitEeP), ssnitEmployer: fromP(r.ssnitErP), tier1: fromP(r.tier1P), tier2: fromP(r.tier2P),
    paye: fromP(r.payeP), specialTax: fromP(r.specialTaxP), preTaxDeductions: fromP(r.preTaxP), otherDeductions: fromP(r.otherP),
    net: fromP(r.netP), employerCost: fromP(r.employerCostP),
  };
}

function itemRows(churchId: string, lineId: string, r: LineResult) {
  return r.items.map((i, idx) => ({
    churchId, lineId, kind: i.kind, code: i.code, label: i.label, amount: fromP(i.amountP),
    taxable: i.taxable, ssnitable: i.ssnitable, preTax: i.preTax, remitted: i.remitted, source: i.source,
    payItemId: i.payItemId, loanId: i.loanId, leaveRequestId: i.leaveRequestId, sortOrder: idx,
  }));
}

/** Bonus already given this year in paid runs (for the special bonus rate's annual cap). */
async function ytdBonus(tx: Tx, churchId: string, staffId: string, year: number, month: number) {
  const items = await tx.payrollLineItem.findMany({
    where: { churchId, code: "bonus", kind: "earning", line: { staffId, excluded: false, run: { status: "paid", year, month: { lt: month } } } },
    select: { amount: true },
  });
  return fromP(items.reduce((t, i) => t + P(i.amount), 0));
}

/**
 * (Re)build every line of a draft run from pay setup. One-off items, notes, "left out" and unpaid days typed by hand
 * are kept for people who were already on the run.
 */
export async function buildRunLines(tx: Tx, churchId: string, runId: string) {
  const run = await tx.payrollRun.findFirst({ where: { id: runId, churchId } });
  if (!run) throw new PayrollError("Payroll not found.");
  if (run.status !== "draft") throw new PayrollError("Only a draft payroll can be rebuilt.");
  const rules = rulesFromJson(run.rules);
  const key = periodKey(run.year, run.month);
  const ms = monthStart(run.year, run.month);
  const me = monthEnd(run.year, run.month);

  const [settings, holidays, staff, previous] = await Promise.all([
    ensureSettings(tx, churchId),
    tx.payrollHoliday.findMany({ where: { churchId, date: { gte: ms, lte: me } }, select: { date: true } }),
    tx.staffMember.findMany({
      where: {
        churchId, status: "active",
        AND: [{ OR: [{ startDate: null }, { startDate: { lte: me } }] }, { OR: [{ endDate: null }, { endDate: { gte: ms } }] }],
      },
      include: {
        pay: true,
        department: { select: { name: true } },
        payItems: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        loans: { where: { status: "active" }, orderBy: { issuedAt: "asc" } },
        leaveRequests: { where: { status: "approved", startDate: { lte: me }, endDate: { gte: ms }, leaveType: { paid: false } }, select: { id: true, startDate: true, endDate: true, halfDay: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    tx.payrollLine.findMany({ where: { runId, churchId }, include: { items: true } }),
  ]);
  const W = runWorkingDays(settings.workingDaysRule, settings.fixedWorkingDays, run.year, run.month, holidays.map((h) => h.date));
  const prevBy = new Map(previous.map((l) => [l.staffId, l]));
  const supplementary = run.kind === "supplementary";

  await tx.payrollLine.deleteMany({ where: { runId, churchId } });

  for (const s of staff) {
    const prev = prevBy.get(s.id);
    const pay = s.pay;
    const items: ItemInput[] = [];
    if (!supplementary) {
      for (const it of s.payItems) {
        if (!inPeriod(key, it.fromPeriod, it.toPeriod)) continue;
        items.push({
          kind: it.kind as "earning" | "deduction", code: it.code, label: it.label, amount: it.amount.toString(),
          taxable: it.taxable, ssnitable: it.ssnitable, preTax: it.preTax, remitted: it.remitted, source: "recurring", payItemId: it.id,
        });
      }
      for (const loan of s.loans) {
        if (loan.startPeriod > key || P(loan.balance) <= 0) continue;
        items.push({
          kind: "deduction", code: loan.kind === "advance" ? "advance" : "loan", label: `${loan.label} (${loan.ref})`,
          amount: loan.installment.toString(), loanBalance: loan.balance.toString(), loanId: loan.id, loanIssuedAt: loan.issuedAt.toISOString(),
          remitted: false, source: "loan",
        });
      }
    }
    // One-off items typed on the previous build are kept.
    for (const it of prev?.items ?? []) {
      if (it.source !== "oneoff") continue;
      items.push(storedToInput(it));
    }
    const leaveDays = supplementary ? 0 : s.leaveRequests.reduce((t, r) => t + unpaidDaysInMonth(r, run.year, run.month, holidays.map((h) => h.date)), 0);
    const unpaidDays = Math.max(leaveDays, prev ? Number(prev.unpaidDays.toString()) : 0);
    const ssnitApplies = pay?.ssnitApplies ?? true;
    const payeApplies = pay?.payeApplies ?? true;
    const result = computeLine({
      basic: supplementary ? 0 : pay?.basicSalary.toString() ?? 0,
      items, unpaidDays, workingDays: W,
      ssnitApplies, tier2Applies: pay?.tier2Applies ?? true, payeApplies,
      ytdSpecialBonus: rules.bonusTaxMode === "ghana" ? await ytdBonus(tx, churchId, s.id, run.year, run.month) : 0,
    }, rulesForStaff(rules, pay?.taxResident));
    const leaveItem = result.items.find((i) => i.code === "unpaid_leave");
    if (leaveItem && leaveDays > 0) leaveItem.leaveRequestId = s.leaveRequests[0]?.id ?? null;

    const line = await tx.payrollLine.create({
      data: {
        churchId, runId, staffId: s.id, staffNo: s.staffNo, staffName: `${s.firstName} ${s.lastName}`.trim(), jobTitle: s.jobTitle,
        departmentId: s.departmentId, departmentName: s.department?.name ?? null, employmentType: s.employmentType,
        payoutMethod: pay?.payoutMethod ?? null,
        payoutLabel: pay ? maskLabel(pay.payoutMethod, { network: pay.momoNetwork, bankName: pay.bankName, last4: pay.payoutMethod === "momo" ? pay.momoNoLast4 : pay.accountNoLast4 }) : null,
        ...lineData(result),
        ssnitApplies, payeApplies,
        unpaidDays: String(unpaidDays), workingDays: W,
        excluded: prev?.excluded ?? false,
        note: prev?.note ?? null,
      },
    });
    if (result.items.length) await tx.payrollLineItem.createMany({ data: itemRows(churchId, line.id, result) });
  }
  await updateRunTotals(tx, churchId, runId);
}

function storedToInput(it: StoredItem): ItemInput {
  return {
    kind: it.kind as "earning" | "deduction", code: it.code, label: it.label, amount: String(it.amount ?? 0),
    taxable: it.taxable, ssnitable: it.ssnitable, preTax: it.preTax, remitted: it.remitted, source: it.source,
    payItemId: it.payItemId, loanId: it.loanId, leaveRequestId: it.leaveRequestId,
  };
}

/** Recalculate one line from its stored items (after an edit in the line editor). */
export async function recalcLine(tx: Tx, churchId: string, lineId: string) {
  const line = await tx.payrollLine.findFirst({ where: { id: lineId, churchId }, include: { items: true, run: true, staff: { include: { pay: true } } } });
  if (!line) throw new PayrollError("Pay line not found.");
  const rules = rulesFromJson(line.run.rules);
  const loanIds = line.items.map((i) => i.loanId).filter((x): x is string => !!x);
  const loans = loanIds.length ? await tx.staffLoan.findMany({ where: { id: { in: loanIds }, churchId } }) : [];
  const loanBy = new Map(loans.map((l) => [l.id, l]));
  const items: ItemInput[] = line.items
    .filter((i) => i.code !== "unpaid_leave")
    .map((i) => {
      const base = storedToInput(i);
      const loan = i.loanId ? loanBy.get(i.loanId) : null;
      // A loan recovery goes back to its full installment, so a cut made earlier is undone when there is room again.
      if (loan && i.source === "loan") return { ...base, amount: loan.installment.toString(), loanBalance: loan.balance.toString(), loanIssuedAt: loan.issuedAt.toISOString() };
      return base;
    });
  const leaveRequestId = line.items.find((i) => i.code === "unpaid_leave")?.leaveRequestId ?? null;
  const result = computeLine({
    basic: line.basic.toString(), items, unpaidDays: Number(line.unpaidDays.toString()), workingDays: line.workingDays,
    ssnitApplies: line.ssnitApplies, payeApplies: line.payeApplies, tier2Applies: line.staff?.pay?.tier2Applies ?? true,
    ytdSpecialBonus: rules.bonusTaxMode === "ghana" && line.staffId ? await ytdBonus(tx, churchId, line.staffId, line.run.year, line.run.month) : 0,
  }, rulesForStaff(rules, line.staff?.pay?.taxResident));
  const leaveItem = result.items.find((i) => i.code === "unpaid_leave");
  if (leaveItem) leaveItem.leaveRequestId = leaveRequestId;
  await tx.payrollLineItem.deleteMany({ where: { lineId, churchId } });
  if (result.items.length) await tx.payrollLineItem.createMany({ data: itemRows(churchId, lineId, result) });
  await tx.payrollLine.update({ where: { id: lineId }, data: lineData(result) });
  await updateRunTotals(tx, churchId, line.runId);
  return result;
}

/** Run totals: sums of the stored (non-excluded) line values. */
export async function updateRunTotals(tx: Tx, churchId: string, runId: string) {
  const lines = await tx.payrollLine.findMany({ where: { runId, churchId, excluded: false } });
  const sum = (f: (l: (typeof lines)[number]) => Dec) => fromP(lines.reduce((t, l) => t + P(f(l)), 0));
  await tx.payrollRun.update({
    where: { id: runId },
    data: {
      headcount: lines.length,
      gross: sum((l) => l.gross),
      ssnitEmployee: sum((l) => l.ssnitEmployee),
      ssnitEmployer: sum((l) => l.ssnitEmployer),
      paye: sum((l) => l.paye),
      otherDeductions: fromP(lines.reduce((t, l) => t + P(l.preTaxDeductions) + P(l.otherDeductions), 0)),
      net: sum((l) => l.net),
      employerCost: sum((l) => l.employerCost),
    },
  });
}

// ── Run lifecycle ──

export async function createRun(tx: Tx, a: { churchId: string; year: number; month: number; kind: "regular" | "supplementary"; actor: Actor; title?: string }) {
  if (!Number.isInteger(a.year) || a.year < 2000 || a.year > 2100 || !Number.isInteger(a.month) || a.month < 1 || a.month > 12) throw new PayrollError("Choose a valid month.");
  const key = periodKey(a.year, a.month);
  const label = periodLabel(a.year, a.month);
  if (a.kind === "regular") {
    const live = await tx.payrollRun.findFirst({ where: { churchId: a.churchId, regularKey: key }, select: { id: true } });
    if (live) throw new PayrollError(`There is already a payroll for ${label}. Open it, or reverse it first.`);
  }
  const rules = await rulesFor(tx, a.churchId, a.year, a.month);
  const supplementaryCount = a.kind === "supplementary" ? await tx.payrollRun.count({ where: { churchId: a.churchId, year: a.year, month: a.month, kind: "supplementary" } }) : 0;
  const run = await tx.payrollRun.create({
    data: {
      churchId: a.churchId, year: a.year, month: a.month, kind: a.kind,
      regularKey: a.kind === "regular" ? key : null,
      title: a.title?.trim() || (a.kind === "regular" ? `${label} payroll` : `${label} extra payroll ${supplementaryCount + 1}`),
      rules: rules as unknown as Prisma.InputJsonValue,
      preparedById: a.actor.id, preparedByName: a.actor.name, preparedAt: new Date(), lastEditedById: a.actor.id,
    },
  });
  await buildRunLines(tx, a.churchId, run.id);
  await writeEvent(tx, { churchId: a.churchId, runId: run.id, action: "run.created", actorId: a.actor.id, actorName: a.actor.name, detail: `Started ${run.title}` });
  return run;
}

/** Bump the run version after an edit; refuses unless the run is a draft at the version the person saw. */
export async function touchDraft(tx: Tx, churchId: string, runId: string, actor: Actor, version?: number) {
  const r = await tx.payrollRun.updateMany({
    where: { id: runId, churchId, status: "draft", ...(version !== undefined ? { version } : {}) },
    data: { version: { increment: 1 }, lastEditedById: actor.id },
  });
  if (r.count !== 1) throw new StaleRunError();
}

export async function refreshRun(tx: Tx, a: { churchId: string; runId: string; actor: Actor; version: number }) {
  const run = await tx.payrollRun.findFirst({ where: { id: a.runId, churchId: a.churchId } });
  if (!run) throw new PayrollError("Payroll not found.");
  if (run.status !== "draft") throw new PayrollError("Only a draft payroll can be refreshed.");
  const rules = await rulesFor(tx, a.churchId, run.year, run.month);
  await touchDraft(tx, a.churchId, a.runId, a.actor, a.version);
  await tx.payrollRun.update({ where: { id: a.runId }, data: { rules: rules as unknown as Prisma.InputJsonValue } });
  await buildRunLines(tx, a.churchId, a.runId);
  await writeEvent(tx, { churchId: a.churchId, runId: a.runId, action: "run.refreshed", actorId: a.actor.id, actorName: a.actor.name, detail: "Refreshed from pay setup" });
}

/** Warnings shown before approval (never blocking). */
export async function runWarnings(tx: Tx, churchId: string, runId: string): Promise<{ text: string; staffIds: string[] }[]> {
  const lines = await tx.payrollLine.findMany({ where: { runId, churchId, excluded: false }, include: { staff: { include: { pay: true } } } });
  const out: { text: string; staffIds: string[] }[] = [];
  const noPayout = lines.filter((l) => !l.staff?.pay || (l.staff.pay.payoutMethod === "bank" && !l.staff.pay.accountNoLast4) || (l.staff.pay.payoutMethod === "momo" && !l.staff.pay.momoNoLast4));
  if (noPayout.length) out.push({ text: `${noPayout.length} staff ${noPayout.length === 1 ? "has" : "have"} no payout details`, staffIds: noPayout.map((l) => l.staffId!).filter(Boolean) });
  const noSsnit = lines.filter((l) => l.ssnitApplies && P(l.ssnitEmployee) > 0 && !l.staff?.pay?.ssnitNoLast4 && !l.staff?.pay?.ghanaCardLast4);
  if (noSsnit.length) out.push({ text: `${noSsnit.length} staff on SSNIT ${noSsnit.length === 1 ? "has" : "have"} no SSNIT or Ghana Card number`, staffIds: noSsnit.map((l) => l.staffId!).filter(Boolean) });
  const noPay = lines.filter((l) => P(l.gross) <= 0);
  if (noPay.length) out.push({ text: `${noPay.length} staff ${noPay.length === 1 ? "has" : "have"} no pay this month`, staffIds: noPay.map((l) => l.staffId!).filter(Boolean) });
  return out;
}

export async function submitRun(tx: Tx, a: { churchId: string; runId: string; version: number; actor: Actor }) {
  const negative = await tx.payrollLine.findMany({ where: { runId: a.runId, churchId: a.churchId, excluded: false, net: { lt: 0 } }, select: { staffName: true } });
  if (negative.length) throw new PayrollError(`Net pay is below zero for ${negative.map((n) => n.staffName).join(", ")}. Reduce a deduction or leave them out first.`);
  const lines = await tx.payrollLine.count({ where: { runId: a.runId, churchId: a.churchId, excluded: false } });
  if (!lines) throw new PayrollError("There is nobody to pay in this payroll.");
  const r = await tx.payrollRun.updateMany({
    where: { id: a.runId, churchId: a.churchId, status: "draft", version: a.version },
    data: { status: "review", submittedById: a.actor.id, submittedByName: a.actor.name, submittedAt: new Date(), version: { increment: 1 } },
  });
  if (r.count !== 1) throw new StaleRunError();
  await writeEvent(tx, { churchId: a.churchId, runId: a.runId, action: "run.submitted", actorId: a.actor.id, actorName: a.actor.name, detail: "Sent for approval" });
  return runWarnings(tx, a.churchId, a.runId);
}

export async function sendBackRun(tx: Tx, a: { churchId: string; runId: string; version: number; actor: Actor; note?: string }) {
  const r = await tx.payrollRun.updateMany({
    where: { id: a.runId, churchId: a.churchId, status: "review", version: a.version },
    data: { status: "draft", submittedById: null, submittedByName: null, submittedAt: null, version: { increment: 1 } },
  });
  if (r.count !== 1) throw new StaleRunError();
  await writeEvent(tx, { churchId: a.churchId, runId: a.runId, action: "run.sent_back", actorId: a.actor.id, actorName: a.actor.name, detail: a.note ? `Sent back: ${a.note.slice(0, 300)}` : "Sent back for changes" });
}

/** Did this person edit their own pay line in this run? (Recorded when it happens.) */
export async function editedOwnLine(tx: Tx, churchId: string, runId: string, actorId: string) {
  return !!(await tx.payrollEvent.findFirst({ where: { churchId, runId, actorId, action: "line.own_edit" }, select: { id: true } }));
}

export async function approveRun(tx: Tx, a: { churchId: string; runId: string; version: number; actor: Actor; mode?: "auto" | "always" }) {
  const run = await tx.payrollRun.findFirst({ where: { id: a.runId, churchId: a.churchId } });
  if (!run) throw new PayrollError("Payroll not found.");
  if (run.version !== a.version) throw new StaleRunError();
  const settings = await ensureSettings(tx, a.churchId);
  const check = canApprove({
    run, actorId: a.actor.id, eligibleManagers: await eligibleManagers(tx, a.churchId),
    mode: a.mode ?? (settings.makerChecker === "always" ? "always" : "auto"),
    actorEditedOwnLine: await editedOwnLine(tx, a.churchId, a.runId, a.actor.id),
  });
  if (!check.ok) throw new PayrollError(check.reason);
  const r = await tx.payrollRun.updateMany({
    where: { id: a.runId, churchId: a.churchId, status: "review", version: a.version },
    data: { status: "approved", approvedById: a.actor.id, approvedByName: a.actor.name, approvedAt: new Date(), selfApproved: check.selfApproved, version: { increment: 1 } },
  });
  if (r.count !== 1) throw new StaleRunError();
  await writeEvent(tx, { churchId: a.churchId, runId: a.runId, action: "run.approved", actorId: a.actor.id, actorName: a.actor.name, detail: check.selfApproved ? "Approved (self-approved)" : "Approved" });
  return { selfApproved: check.selfApproved };
}

/** The 14th (SSNIT) or 15th (PAYE) of the month after the run. */
function dueNextMonth(year: number, month: number, day: number) {
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, day, 12));
}

async function fundCheck(tx: Tx, churchId: string, fundId: string | null | undefined, amount: number) {
  if (!fundId) return null;
  const fund = await tx.fund.findFirst({ where: { id: fundId, churchId }, select: { id: true, name: true, restricted: true } });
  if (!fund) throw new PayrollError("That fund was not found.");
  if (fund.restricted) {
    const [given, spent] = await Promise.all([
      tx.gift.aggregate({ where: { churchId, fundId }, _sum: { amount: true } }),
      tx.expense.aggregate({ where: { churchId, fundId }, _sum: { amount: true } }),
    ]);
    const balance = Number(given._sum.amount ?? 0) - Number(spent._sum.amount ?? 0);
    if (amount > balance + 0.004) throw new PayrollError(`${fund.name} only holds GHS ${balance.toFixed(2)}. Pay from another fund or none.`);
  }
  return fund.id;
}

const POSTING_VENDOR: Record<string, string> = { net_pay: "Payroll", ssnit: "SSNIT", paye: "GRA", deductions: "Payroll" };

function postingDescription(kind: string, period: string, headcount: number) {
  const staff = `${headcount} staff`;
  switch (kind) {
    case "net_pay": return `Staff salaries, ${period} (net pay, ${staff})`;
    case "ssnit": return `SSNIT contributions, ${period} (${staff})`;
    case "paye": return `PAYE income tax, ${period} (${staff})`;
    default: return `Staff deductions paid over, ${period}`;
  }
}

function postingCategory(kind: string, s: { salaryCategory: string; ssnitCategory: string; payeCategory: string; deductionsCategory: string }) {
  return kind === "net_pay" ? s.salaryCategory : kind === "ssnit" ? s.ssnitCategory : kind === "paye" ? s.payeCategory : s.deductionsCategory;
}

/**
 * Mark an approved run as paid: one Expense for net pay (vendor "Payroll", never a name), postings for what is still
 * owed to SSNIT, GRA and third parties, loan balances reduced. Wrap in a Serializable transaction when a restricted
 * fund is chosen.
 */
export async function markPaid(tx: Tx, a: { churchId: string; runId: string; version: number; actor: Actor; accountId: string | null; payDate: Date; fundId?: string | null }) {
  const run = await tx.payrollRun.findFirst({ where: { id: a.runId, churchId: a.churchId } });
  if (!run) throw new PayrollError("Payroll not found.");
  if (run.status !== "approved" || run.version !== a.version) throw new StaleRunError(run.status === "paid" ? "This payroll is already marked as paid." : undefined);
  const settings = await ensureSettings(tx, a.churchId);
  const lines = await tx.payrollLine.findMany({ where: { runId: a.runId, churchId: a.churchId, excluded: false }, include: { items: true } });
  const period = periodLabel(run.year, run.month);
  const netP = lines.reduce((t, l) => t + P(l.net), 0);
  const ssnitP = lines.reduce((t, l) => t + P(l.ssnitEmployee) + P(l.ssnitEmployer), 0);
  const payeP = lines.reduce((t, l) => t + P(l.paye), 0);
  const remitP = lines.reduce((t, l) => t + l.items.filter((i) => i.kind === "deduction" && (i.remitted || i.preTax)).reduce((s, i) => s + P(i.amount), 0), 0);
  const fundId = await fundCheck(tx, a.churchId, a.fundId, pToNumber(netP));

  // Claim the run first, so a second click fails before anything is written.
  const claimed = await tx.payrollRun.updateMany({
    where: { id: a.runId, churchId: a.churchId, status: "approved", version: a.version },
    data: { status: "paid", paidById: a.actor.id, paidByName: a.actor.name, paidAt: new Date(), payDate: a.payDate, accountId: a.accountId, fundId: fundId ?? null, version: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new StaleRunError();

  const together = settings.postingMode === "together";
  const postings: { kind: string; amountP: number; due: Date | null }[] = [
    { kind: "net_pay", amountP: netP, due: null },
    { kind: "ssnit", amountP: ssnitP, due: dueNextMonth(run.year, run.month, 14) },
    { kind: "paye", amountP: payeP, due: dueNextMonth(run.year, run.month, 15) },
    { kind: "deductions", amountP: remitP, due: dueNextMonth(run.year, run.month, 14) },
  ];
  for (const p of postings) {
    if (p.amountP <= 0) continue;
    const postNow = p.kind === "net_pay" || together;
    let expenseId: string | null = null;
    if (postNow) {
      const exp = await tx.expense.create({
        data: {
          churchId: a.churchId, description: postingDescription(p.kind, period, lines.length), category: postingCategory(p.kind, settings),
          amount: pToNumber(p.amountP), vendor: POSTING_VENDOR[p.kind] ?? "Payroll", approvedBy: run.approvedByName,
          ...(a.accountId ? { accountId: a.accountId } : {}), ...(fundId && p.kind === "net_pay" ? { fundId } : {}),
          date: a.payDate, payrollRunId: run.id,
        },
      });
      expenseId = exp.id;
    }
    await tx.payrollPosting.create({
      data: {
        churchId: a.churchId, runId: run.id, kind: p.kind, label: postingDescription(p.kind, period, lines.length), amount: fromP(p.amountP),
        status: postNow ? "posted" : "pending", dueDate: p.due, accountId: postNow ? a.accountId : null, expenseId,
        postedAt: postNow ? new Date() : null, postedById: postNow ? a.actor.id : null,
      },
    });
  }

  // Loan and advance recoveries reduce what is owed (no cash moves for these).
  for (const l of lines) {
    for (const i of l.items) {
      if (!i.loanId || i.kind !== "deduction") continue;
      const loan = await tx.staffLoan.findFirst({ where: { id: i.loanId, churchId: a.churchId } });
      if (!loan) continue;
      const balP = Math.max(0, P(loan.balance) - P(i.amount));
      await tx.staffLoan.update({ where: { id: loan.id }, data: { balance: fromP(balP), status: balP === 0 ? "cleared" : loan.status } });
    }
  }

  // Phase 3: department budgets (only when the church switched it on).
  if (settings.budgetLinkOn) {
    const byDept = new Map<string, number>();
    for (const l of lines) if (l.departmentId) byDept.set(l.departmentId, (byDept.get(l.departmentId) ?? 0) + P(l.employerCost));
    for (const [departmentId, costP] of byDept) {
      const budget = await tx.budget.findFirst({ where: { churchId: a.churchId, departmentId, year: run.year, status: { in: ["approved", "active"] } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (!budget || costP <= 0) continue;
      const entry = await tx.budgetEntry.create({ data: { churchId: a.churchId, budgetId: budget.id, type: "expense", description: `Staff costs, ${period}`, category: "Staff costs", amount: pToNumber(costP), date: a.payDate, createdById: a.actor.id } });
      await tx.payrollPosting.create({ data: { churchId: a.churchId, runId: run.id, kind: "budget", label: `Department budget: staff costs, ${period}`, amount: fromP(costP), status: "posted", budgetEntryId: entry.id, postedAt: new Date(), postedById: a.actor.id } });
    }
  }

  await writeEvent(tx, { churchId: a.churchId, runId: run.id, action: "run.paid", actorId: a.actor.id, actorName: a.actor.name, detail: `Marked as paid on ${dayKey(a.payDate)}` });
  return { headcount: lines.length, netP, ssnitP, payeP, remitP };
}

export async function markRemitted(tx: Tx, a: { churchId: string; postingId: string; actor: Actor; accountId: string | null; date: Date; reference?: string | null }) {
  const posting = await tx.payrollPosting.findFirst({ where: { id: a.postingId, churchId: a.churchId }, include: { run: true } });
  if (!posting) throw new PayrollError("That payment was not found.");
  if (posting.status !== "pending") throw new StaleRunError("This has already been recorded.");
  if (posting.run.status !== "paid") throw new PayrollError("The payroll for this is not paid.");
  const settings = await ensureSettings(tx, a.churchId);
  const claimed = await tx.payrollPosting.updateMany({
    where: { id: posting.id, churchId: a.churchId, status: "pending" },
    data: { status: "posted", postedAt: new Date(), postedById: a.actor.id, accountId: a.accountId, reference: a.reference?.slice(0, 80) || null },
  });
  if (claimed.count !== 1) throw new StaleRunError("This has already been recorded.");
  const exp = await tx.expense.create({
    data: {
      churchId: a.churchId, description: posting.label, category: postingCategory(posting.kind, settings), amount: pToNumber(P(posting.amount)),
      vendor: POSTING_VENDOR[posting.kind] ?? "Payroll", receiptRef: a.reference?.slice(0, 80) || null,
      ...(a.accountId ? { accountId: a.accountId } : {}), date: a.date, payrollRunId: posting.runId,
    },
  });
  await tx.payrollPosting.update({ where: { id: posting.id }, data: { expenseId: exp.id } });
  await writeEvent(tx, { churchId: a.churchId, runId: posting.runId, action: "posting.remitted", actorId: a.actor.id, actorName: a.actor.name, detail: `Recorded ${posting.kind === "ssnit" ? "SSNIT" : posting.kind === "paye" ? "PAYE" : "deductions"} as paid over${a.reference ? ` (ref ${a.reference.slice(0, 40)})` : ""}` });
  return exp;
}

/**
 * Reverse a paid run. "never_paid": the run's expenses are deleted outright (the PayrollEvent trail is the permanent
 * record). "returned": a positive correction Transaction is posted for every posted amount. Either way pending
 * payments are cancelled, loans are restored and the month can be run again.
 */
export async function reverseRun(tx: Tx, a: { churchId: string; runId: string; version: number; actor: Actor; mode: "never_paid" | "returned"; reason: string }) {
  const run = await tx.payrollRun.findFirst({ where: { id: a.runId, churchId: a.churchId } });
  if (!run) throw new PayrollError("Payroll not found.");
  if (!a.reason.trim()) throw new PayrollError("Say why this payroll is being reversed.");
  const claimed = await tx.payrollRun.updateMany({
    where: { id: a.runId, churchId: a.churchId, status: "paid", version: a.version },
    data: {
      status: "reversed", regularKey: null, reversedById: a.actor.id, reversedByName: a.actor.name, reversedAt: new Date(),
      reversalMode: a.mode, reversalReason: a.reason.slice(0, 500), version: { increment: 1 },
    },
  });
  if (claimed.count !== 1) throw new StaleRunError();
  const period = periodLabel(run.year, run.month);
  const postings = await tx.payrollPosting.findMany({ where: { runId: run.id, churchId: a.churchId } });

  if (a.mode === "never_paid") {
    await tx.expense.deleteMany({ where: { churchId: a.churchId, payrollRunId: run.id } });
  } else {
    for (const p of postings) {
      if (p.status !== "posted" || !p.expenseId) continue;
      const exp = await tx.expense.findFirst({ where: { id: p.expenseId, churchId: a.churchId }, select: { category: true, accountId: true } });
      await tx.transaction.create({
        data: {
          churchId: a.churchId, description: `Correction: ${period} payroll returned (${p.kind === "net_pay" ? "net pay" : p.kind === "ssnit" ? "SSNIT" : p.kind === "paye" ? "PAYE" : "deductions"})`,
          category: exp?.category ?? "Salaries and wages", fund: "General", accountId: exp?.accountId ?? p.accountId ?? null,
          amount: fromP(P(p.amount)), date: new Date(), payrollRunId: run.id,
        },
      });
    }
  }
  const budgetIds = postings.map((p) => p.budgetEntryId).filter((x): x is string => !!x);
  if (budgetIds.length) await tx.budgetEntry.deleteMany({ where: { id: { in: budgetIds }, churchId: a.churchId } });
  await tx.payrollPosting.updateMany({ where: { runId: run.id, churchId: a.churchId }, data: { status: "reversed", reversedAt: new Date() } });

  // Restore loan balances by what this run recovered.
  const loanItems = await tx.payrollLineItem.findMany({ where: { churchId: a.churchId, loanId: { not: null }, kind: "deduction", line: { runId: run.id, excluded: false } }, select: { loanId: true, amount: true } });
  for (const i of loanItems) {
    const loan = await tx.staffLoan.findFirst({ where: { id: i.loanId!, churchId: a.churchId } });
    if (!loan) continue;
    await tx.staffLoan.update({ where: { id: loan.id }, data: { balance: fromP(P(loan.balance) + P(i.amount)), status: loan.status === "cleared" ? "active" : loan.status } });
  }
  await writeEvent(tx, { churchId: a.churchId, runId: run.id, action: "run.reversed", actorId: a.actor.id, actorName: a.actor.name, detail: `Reversed (${a.mode === "never_paid" ? "it was never paid out" : "the money came back"}): ${a.reason.slice(0, 300)}` });
}

export async function deleteDraftRun(tx: Tx, a: { churchId: string; runId: string; actor: Actor }) {
  const run = await tx.payrollRun.findFirst({ where: { id: a.runId, churchId: a.churchId }, select: { status: true, title: true } });
  if (!run) throw new PayrollError("Payroll not found.");
  const r = await tx.payrollRun.deleteMany({ where: { id: a.runId, churchId: a.churchId, status: "draft" } });
  if (r.count !== 1) throw new PayrollError("Only a draft payroll can be deleted.");
  await writeEvent(tx, { churchId: a.churchId, action: "run.deleted", actorId: a.actor.id, actorName: a.actor.name, detail: `Deleted draft ${run.title}` });
}

// ── Loans ──

export async function createLoan(tx: Tx, a: {
  churchId: string; staffId: string; kind: "loan" | "advance"; label: string; principal: string; installment: string; startPeriod: string;
  accountId?: string | null; postExpense?: boolean; note?: string | null; actor: Actor;
}) {
  const principalP = toP(a.principal);
  const installmentP = toP(a.installment);
  if (principalP <= 0) throw new PayrollError("Enter the amount given.");
  if (installmentP <= 0 || installmentP > principalP) throw new PayrollError("The monthly recovery must be more than 0 and not more than the amount.");
  const settings = await ensureSettings(tx, a.churchId);
  const bumped = await tx.payrollSettings.update({ where: { churchId: a.churchId }, data: { loanSeq: { increment: 1 } }, select: { loanSeq: true } });
  const ref = `L-${String(bumped.loanSeq).padStart(4, "0")}`;
  const loan = await tx.staffLoan.create({
    data: {
      churchId: a.churchId, staffId: a.staffId, ref, kind: a.kind, label: a.label.trim().slice(0, 80) || (a.kind === "advance" ? "Salary advance" : "Staff loan"),
      principal: fromP(principalP), installment: fromP(installmentP), balance: fromP(principalP), startPeriod: a.startPeriod,
      accountId: a.accountId ?? null, note: a.note?.slice(0, 300) || null, createdById: a.actor.id, createdByName: a.actor.name,
    },
  });
  if (a.postExpense) {
    await tx.expense.create({
      data: {
        churchId: a.churchId, description: `Staff ${a.kind === "advance" ? "advance" : "loan"} ${ref}`, category: settings.loansCategory,
        amount: pToNumber(principalP), vendor: "Payroll", ...(a.accountId ? { accountId: a.accountId } : {}), date: new Date(), staffLoanId: loan.id,
      },
    });
  }
  await writeEvent(tx, { churchId: a.churchId, staffId: a.staffId, action: "loan.created", actorId: a.actor.id, actorName: a.actor.name, detail: `Gave ${a.kind === "advance" ? "advance" : "loan"} ${ref}` });
  return loan;
}

// ── Year to date ──

export async function ytdFor(tx: Tx, churchId: string, staffId: string, year: number, uptoMonth: number) {
  const lines = await tx.payrollLine.findMany({
    where: { churchId, staffId, excluded: false, run: { status: "paid", year, month: { lte: uptoMonth } } },
    select: { gross: true, ssnitEmployee: true, paye: true, net: true, preTaxDeductions: true, otherDeductions: true },
  });
  const sum = (f: (l: (typeof lines)[number]) => Dec) => lines.reduce((t, l) => t + P(f(l)), 0);
  return { grossP: sum((l) => l.gross), ssnitP: sum((l) => l.ssnitEmployee), payeP: sum((l) => l.paye), netP: sum((l) => l.net), deductionsP: sum((l) => l.preTaxDeductions) + sum((l) => l.otherDeductions) };
}

export { P as decToP };
