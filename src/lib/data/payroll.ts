import "server-only";
import { db } from "@/lib/db";
import { ensureSettings, ytdFor, runWarnings, eligibleManagers, editedOwnLine } from "@/lib/payroll/engine";
import { canApprove, rulesFromJson } from "@/lib/payroll/rules";
import { toP } from "@/lib/payroll/calc";

const n = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? 0 : Number(v.toString()));

/** Payroll home: every run, newest first. Only called for payroll holders. */
export async function listRuns(churchId: string) {
  const runs = await db.payrollRun.findMany({
    where: { churchId },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true, year: true, month: true, kind: true, title: true, status: true, headcount: true, net: true, gross: true, employerCost: true,
      preparedByName: true, approvedByName: true, selfApproved: true, paidAt: true, createdAt: true,
    },
  });
  return runs.map((r) => ({ ...r, net: n(r.net), gross: n(r.gross), employerCost: n(r.employerCost), paidAt: r.paidAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}

/** SSNIT, PAYE and deductions still to pay over. */
export async function pendingRemittances(churchId: string) {
  const rows = await db.payrollPosting.findMany({
    where: { churchId, status: "pending" },
    orderBy: { dueDate: "asc" },
    include: { run: { select: { year: true, month: true, title: true } } },
  });
  return rows.map((p) => ({
    id: p.id, kind: p.kind, label: p.label, amount: n(p.amount), dueDate: p.dueDate?.toISOString() ?? null,
    runId: p.runId, year: p.run.year, month: p.run.month,
  }));
}

/** The first-run checklist. */
export async function payrollChecklist(churchId: string) {
  const [settings, bandSets, activeStaff, withPay, runs, savedSettings] = await Promise.all([
    ensureSettings(db, churchId),
    db.payeBandSet.count({ where: { churchId } }),
    db.staffMember.count({ where: { churchId, status: "active" } }),
    db.staffMember.count({ where: { churchId, status: "active", pay: { isNot: null } } }),
    db.payrollRun.count({ where: { churchId, status: "paid" } }),
    db.payrollEvent.count({ where: { churchId, action: "settings.saved" } }),
  ]);
  return {
    paidRuns: runs,
    items: [
      { key: "rates", label: "Statutory rates confirmed with your accountant", done: savedSettings > 0 || runs > 0, href: "/app/payroll/settings" },
      { key: "bands", label: "PAYE bands checked", done: bandSets > 0 || runs > 0, href: "/app/payroll/settings#bands" },
      { key: "account", label: "Default account chosen", done: !!settings.defaultAccountId, href: "/app/payroll/settings#ledger" },
      { key: "staff", label: activeStaff ? `Pay set up for every active staff member (${withPay} of ${activeStaff})` : "Add your staff", done: activeStaff > 0 && withPay >= activeStaff, href: "/app/staff" },
    ],
  };
}

export async function runDetail(churchId: string, runId: string, viewer: { userId: string; staffId?: string | null }) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, churchId },
    include: {
      account: { select: { name: true } },
      lines: { orderBy: [{ excluded: "asc" }, { staffName: "asc" }], include: { items: { orderBy: { sortOrder: "asc" } } } },
      postings: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) return null;
  const [events, settings, warnings, managers, ownEdit] = await Promise.all([
    db.payrollEvent.findMany({ where: { churchId, runId }, orderBy: { createdAt: "desc" }, take: 80 }),
    ensureSettings(db, churchId),
    run.status === "draft" || run.status === "review" ? runWarnings(db, churchId, runId) : Promise.resolve([]),
    eligibleManagers(db, churchId),
    editedOwnLine(db, churchId, runId, viewer.userId),
  ]);
  // Last month's net per staff, for "pay is X% higher than last month".
  const prevRun = await db.payrollRun.findFirst({
    where: { churchId, status: "paid", kind: "regular", OR: [{ year: { lt: run.year } }, { year: run.year, month: { lt: run.month } }] },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, lines: { select: { staffId: true, gross: true } } },
  });
  const prevGross = new Map((prevRun?.lines ?? []).map((l) => [l.staffId, n(l.gross)]));
  const jumps = run.lines
    .filter((l) => !l.excluded && l.staffId && prevGross.has(l.staffId) && (prevGross.get(l.staffId) ?? 0) > 0)
    .map((l) => ({ name: l.staffName, lineId: l.id, pct: Math.round(((n(l.gross) - prevGross.get(l.staffId)!) / prevGross.get(l.staffId)!) * 100) }))
    .filter((j) => Math.abs(j.pct) >= 20);

  const approve = canApprove({
    run, actorId: viewer.userId, eligibleManagers: managers, mode: settings.makerChecker === "always" ? "always" : "auto", actorEditedOwnLine: ownEdit,
  });
  const ownLine = viewer.staffId ? run.lines.find((l) => l.staffId === viewer.staffId && !l.excluded) : null;

  return {
    id: run.id, year: run.year, month: run.month, kind: run.kind, title: run.title, status: run.status, version: run.version,
    payDate: run.payDate?.toISOString() ?? null, accountId: run.accountId, accountName: run.account?.name ?? null, fundId: run.fundId,
    rules: rulesFromJson(run.rules),
    totals: {
      headcount: run.headcount, gross: n(run.gross), ssnitEmployee: n(run.ssnitEmployee), ssnitEmployer: n(run.ssnitEmployer), paye: n(run.paye),
      otherDeductions: n(run.otherDeductions), net: n(run.net), employerCost: n(run.employerCost),
    },
    people: {
      preparedByName: run.preparedByName, preparedAt: run.preparedAt?.toISOString() ?? null,
      submittedByName: run.submittedByName, submittedAt: run.submittedAt?.toISOString() ?? null,
      approvedByName: run.approvedByName, approvedAt: run.approvedAt?.toISOString() ?? null, selfApproved: run.selfApproved,
      paidByName: run.paidByName, paidAt: run.paidAt?.toISOString() ?? null,
      reversedByName: run.reversedByName, reversedAt: run.reversedAt?.toISOString() ?? null, reversalMode: run.reversalMode, reversalReason: run.reversalReason,
    },
    lines: run.lines.map((l) => ({
      id: l.id, staffId: l.staffId, staffNo: l.staffNo, staffName: l.staffName, jobTitle: l.jobTitle, departmentName: l.departmentName,
      payoutLabel: l.payoutLabel, basic: n(l.basic), gross: n(l.gross), ssnitBase: n(l.ssnitBase), taxableIncome: n(l.taxableIncome),
      ssnitEmployee: n(l.ssnitEmployee), ssnitEmployer: n(l.ssnitEmployer), tier1: n(l.tier1), tier2: n(l.tier2), paye: n(l.paye), specialTax: n(l.specialTax),
      preTaxDeductions: n(l.preTaxDeductions), otherDeductions: n(l.otherDeductions), net: n(l.net), employerCost: n(l.employerCost),
      ssnitApplies: l.ssnitApplies, payeApplies: l.payeApplies, unpaidDays: n(l.unpaidDays), workingDays: l.workingDays,
      excluded: l.excluded, note: l.note, emailedAt: l.emailedAt?.toISOString() ?? null, smsAt: l.smsAt?.toISOString() ?? null,
      isMine: !!viewer.staffId && l.staffId === viewer.staffId,
      items: l.items.map((i) => ({ id: i.id, kind: i.kind, code: i.code, label: i.label, amount: n(i.amount), taxable: i.taxable, preTax: i.preTax, remitted: i.remitted, source: i.source, loanId: i.loanId })),
    })),
    postings: run.postings.map((p) => ({ id: p.id, kind: p.kind, label: p.label, amount: n(p.amount), status: p.status, dueDate: p.dueDate?.toISOString() ?? null, postedAt: p.postedAt?.toISOString() ?? null, reference: p.reference })),
    events: events.map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, detail: e.detail, at: e.createdAt.toISOString() })),
    warnings: [
      ...warnings.map((w) => w.text),
      ...jumps.map((j) => `${j.name}'s pay is ${Math.abs(j.pct)}% ${j.pct > 0 ? "higher" : "lower"} than last month`),
      ...(ownLine && (run.status === "draft" || run.status === "review") ? ["You are in this payroll. Someone else should approve it."] : []),
    ],
    approval: approve.ok ? { ok: true as const, selfApproved: approve.selfApproved } : { ok: false as const, reason: approve.reason },
    managers: managers.length,
  };
}

export type RunDetail = NonNullable<Awaited<ReturnType<typeof runDetail>>>;

/** A staff member's own payslips: paid runs only, newest first. */
export async function myPayslips(churchId: string, staffId: string, take = 12) {
  const lines = await db.payrollLine.findMany({
    where: { churchId, staffId, excluded: false, run: { status: "paid" } },
    orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
    take,
    select: { id: true, net: true, gross: true, run: { select: { year: true, month: true, title: true, kind: true, payDate: true } } },
  });
  return lines.map((l) => ({ lineId: l.id, net: n(l.net), gross: n(l.gross), year: l.run.year, month: l.run.month, title: l.run.title, kind: l.run.kind, payDate: l.run.payDate?.toISOString() ?? null }));
}

export async function myYtd(churchId: string, staffId: string, year: number) {
  const y = await ytdFor(db, churchId, staffId, year, 12);
  return { gross: y.grossP / 100, ssnit: y.ssnitP / 100, paye: y.payeP / 100, net: y.netP / 100, deductions: y.deductionsP / 100 };
}

/** Payslips for the staff profile (payroll holders only). */
export async function staffPayslips(churchId: string, staffId: string) {
  return myPayslips(churchId, staffId, 24);
}

/** Recent payroll trail for the settings page. */
export async function recentEvents(churchId: string, take = 50) {
  const rows = await db.payrollEvent.findMany({ where: { churchId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, detail: e.detail, at: e.createdAt.toISOString(), runId: e.runId }));
}

export { toP };
