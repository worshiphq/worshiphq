"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { payrollActor, actorOf, errorResult, type ActionResult } from "@/lib/payroll/access";
import {
  writeEvent, ensureSettings, createRun, refreshRun, recalcLine, touchDraft, submitRun, sendBackRun, approveRun, markPaid, markRemitted,
  reverseRun, deleteDraftRun, createLoan, PayrollError,
} from "@/lib/payroll/engine";
import { BandsSchema, SettingsSchema, isPeriod } from "@/lib/payroll/rules";
import { periodLabel, toP, fromP } from "@/lib/payroll/calc";
import { sealId, revealId, SECRET_COLUMNS, type SecretField } from "@/lib/payroll/secrets";
import { GHANA_CARD_RE } from "@/lib/payroll/mask";
import { DEFAULT_PAYROLL_RULES, GHANA_PAYE_BANDS_2024, GHANA_PAYE_BANDS_NAME, EARNING_CODES, DEDUCTION_CODES, ONEOFF_EARNING_CODES } from "@/lib/payroll/defaults";

const str = (fd: FormData, k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);
const on = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const money = (v: string) => {
  const p = toP(v);
  return Number.isFinite(p) ? p : NaN;
};
const dateOf = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00.000Z`) : null);

function touch(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

async function staffOf(churchId: string, staffId: string) {
  return db.staffMember.findFirst({ where: { id: String(staffId), churchId }, select: { id: true, firstName: true, lastName: true, staffNo: true } });
}

// ── Pay setup ──

/** Salary, statutory switches, sealed ID numbers and payout details. An empty ID field leaves it as it was. */
export async function savePayProfile(staffId: string, fd: FormData): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const staff = await staffOf(s.churchId, staffId);
    if (!staff) return { ok: false, error: "Staff record not found." };
    const basicP = money(str(fd, "basicSalary", 20) || "0");
    if (!Number.isFinite(basicP) || basicP < 0 || basicP > toP(10_000_000)) return { ok: false, error: "Enter a basic salary between 0 and 10,000,000." };
    const payoutMethod = ["bank", "momo", "cash", "cheque"].includes(str(fd, "payoutMethod")) ? str(fd, "payoutMethod") : "bank";

    const data: Prisma.StaffPayProfileUncheckedUpdateInput = {
      basicSalary: fromP(basicP),
      ssnitApplies: on(fd, "ssnitApplies"), tier2Applies: on(fd, "tier2Applies"), payeApplies: on(fd, "payeApplies"),
      isClergy: on(fd, "isClergy"), taxResident: !on(fd, "nonResident"),
      payoutMethod, bankName: str(fd, "bankName", 80) || null, bankBranch: str(fd, "bankBranch", 80) || null, accountName: str(fd, "accountName", 80) || null,
      momoNetwork: str(fd, "momoNetwork", 20) || null, updatedById: s.userId,
    };
    const changed: string[] = [];
    for (const field of Object.keys(SECRET_COLUMNS) as SecretField[]) {
      const col = SECRET_COLUMNS[field];
      const raw = str(fd, field, 40).toUpperCase();
      if (on(fd, `clear_${field}`)) {
        (data as Record<string, unknown>)[col.sealed] = null;
        (data as Record<string, unknown>)[col.last4] = null;
        changed.push(`cleared ${col.label}`);
        continue;
      }
      if (!raw) continue;
      if (field === "ghanaCard" && !GHANA_CARD_RE.test(raw)) return { ok: false, error: "A Ghana Card number looks like GHA-123456789-0." };
      if (field !== "ghanaCard" && !/^[A-Z0-9 -]{4,30}$/.test(raw)) return { ok: false, error: `Check the ${col.label}: letters, numbers and spaces only.` };
      const sealed = sealId(field === "accountNo" || field === "momoNo" ? raw.replace(/\s/g, "") : raw);
      (data as Record<string, unknown>)[col.sealed] = sealed.sealed;
      (data as Record<string, unknown>)[col.last4] = sealed.last4;
      changed.push(`updated ${col.label}`);
    }
    await db.staffPayProfile.upsert({
      where: { staffId: staff.id },
      update: data,
      create: { ...(data as Prisma.StaffPayProfileUncheckedCreateInput), staffId: staff.id, churchId: s.churchId },
    });
    // The trail says what changed, never the salary or the numbers themselves.
    await writeEvent(db, { churchId: s.churchId, staffId: staff.id, action: "pay.updated", actorId: s.userId, actorName: s.name, detail: `Updated pay setup of ${staff.staffNo ?? staff.firstName}${changed.length ? ` (${changed.join(", ")})` : ""}` });
    await audit(s, "update", "staff-pay", `Updated pay setup for ${staff.firstName} ${staff.lastName}`, staff.id);
    touch(`/app/staff/${staff.id}`);
    return { ok: true, message: "Pay setup saved" };
  } catch (e) {
    return errorResult(e);
  }
}

/** Add or edit a recurring allowance or deduction. */
export async function savePayItem(staffId: string, fd: FormData): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const staff = await staffOf(s.churchId, staffId);
  if (!staff) return { ok: false, error: "Staff record not found." };
  const kind = str(fd, "kind") === "deduction" ? "deduction" : "earning";
  const code = str(fd, "code", 30) || "other";
  const known = kind === "earning" ? EARNING_CODES.find((c) => c.code === code) : DEDUCTION_CODES.find((c) => c.code === code);
  const label = str(fd, "label", 60) || known?.label || (kind === "earning" ? "Allowance" : "Deduction");
  const amountP = money(str(fd, "amount", 20));
  if (!Number.isFinite(amountP) || amountP <= 0 || amountP > toP(10_000_000)) return { ok: false, error: "Enter an amount above 0." };
  const fromPeriod = str(fd, "fromPeriod", 7) || null;
  const toPeriod = str(fd, "toPeriod", 7) || null;
  if ((fromPeriod && !isPeriod(fromPeriod)) || (toPeriod && !isPeriod(toPeriod))) return { ok: false, error: "Months look like 2026-11." };
  if (fromPeriod && toPeriod && toPeriod < fromPeriod) return { ok: false, error: "The last month is before the first month." };
  const data = {
    kind, code, label, amount: fromP(amountP), fromPeriod, toPeriod,
    taxable: kind === "earning" ? on(fd, "taxable") : false,
    ssnitable: kind === "earning" ? on(fd, "ssnitable") : false,
    preTax: kind === "deduction" ? on(fd, "preTax") : false,
    remitted: kind === "deduction" ? on(fd, "remitted") || on(fd, "preTax") : false,
  };
  const id = str(fd, "id", 40);
  if (id) {
    const r = await db.staffPayItem.updateMany({ where: { id, churchId: s.churchId, staffId: staff.id }, data });
    if (r.count !== 1) return { ok: false, error: "That item was not found." };
  } else {
    await db.staffPayItem.create({ data: { ...data, churchId: s.churchId, staffId: staff.id } });
  }
  await writeEvent(db, { churchId: s.churchId, staffId: staff.id, action: "pay.item_saved", actorId: s.userId, actorName: s.name, detail: `${id ? "Changed" : "Added"} ${kind} "${label}" for ${staff.staffNo ?? staff.firstName}` });
  touch(`/app/staff/${staff.id}`);
  return { ok: true, message: id ? "Saved" : `${label} added` };
}

export async function deletePayItem(id: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const item = await db.staffPayItem.findFirst({ where: { id: String(id), churchId: s.churchId }, select: { id: true, staffId: true, label: true } });
  if (!item) return { ok: false, error: "That item was not found." };
  await db.staffPayItem.delete({ where: { id: item.id } });
  await writeEvent(db, { churchId: s.churchId, staffId: item.staffId, action: "pay.item_removed", actorId: s.userId, actorName: s.name, detail: `Removed "${item.label}"` });
  touch(`/app/staff/${item.staffId}`);
  return { ok: true, message: "Removed" };
}

/**
 * Show one sealed number in full. Payroll view or above, rate limited, and every view is written to the payroll trail.
 * The screen hides it again after 30 seconds.
 */
export async function revealStaffSecret(staffId: string, field: string): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const a = await payrollActor("view");
  if (!a.ok) return a;
  const s = a.session;
  if (!(field in SECRET_COLUMNS)) return { ok: false, error: "Unknown field." };
  const { rateLimit, HOUR } = await import("@/lib/rate-limit");
  if (!(await rateLimit(`reveal:${s.userId}`, 30, HOUR))) return { ok: false, error: "You have looked up a lot of numbers in the last hour. Please wait a while." };
  const col = SECRET_COLUMNS[field as SecretField];
  const pay = await db.staffPayProfile.findFirst({ where: { staffId: String(staffId), churchId: s.churchId }, select: { [col.sealed]: true, staff: { select: { staffNo: true, firstName: true } } } }) as unknown as ({ staff: { staffNo: string | null; firstName: string } } & Record<string, string | null>) | null;
  if (!pay) return { ok: false, error: "Not found." };
  const value = revealId(pay[col.sealed]);
  if (!value) return { ok: false, error: pay[col.sealed] ? "This number can no longer be read. Please enter it again." : "Not added yet." };
  await writeEvent(db, { churchId: s.churchId, staffId: String(staffId), action: "secret.viewed", actorId: s.userId, actorName: s.name, detail: `Viewed the ${col.label} of ${pay.staff.staffNo ?? pay.staff.firstName}` });
  return { ok: true, value };
}

// ── Loans ──

export async function createStaffLoan(staffId: string, fd: FormData): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const staff = await staffOf(s.churchId, staffId);
    if (!staff) return { ok: false, error: "Staff record not found." };
    const startPeriod = str(fd, "startPeriod", 7);
    if (!isPeriod(startPeriod)) return { ok: false, error: "Choose the first month to recover it." };
    const accountRaw = str(fd, "accountId", 40);
    const accountId = accountRaw ? (await db.churchAccount.findFirst({ where: { id: accountRaw, churchId: s.churchId }, select: { id: true } }))?.id ?? null : null;
    const postExpense = on(fd, "postExpense");
    if (postExpense && !accountId) return { ok: false, error: "Choose the account the money came from, or untick \"Record it as money out\"." };
    const loan = await db.$transaction((tx) => createLoan(tx, {
      churchId: s.churchId, staffId: staff.id, kind: str(fd, "kind") === "advance" ? "advance" : "loan", label: str(fd, "label", 80),
      principal: str(fd, "principal", 20), installment: str(fd, "installment", 20), startPeriod, accountId, postExpense, note: str(fd, "note", 300), actor: actorOf(s),
    }));
    await audit(s, "create", "staff-loan", `Recorded staff ${loan.kind} ${loan.ref}`, loan.id);
    touch(`/app/staff/${staff.id}`, "/app/expenses", "/app/accounting");
    return { ok: true, message: `${loan.kind === "advance" ? "Advance" : "Loan"} ${loan.ref} recorded` };
  } catch (e) {
    return errorResult(e);
  }
}

export async function writeOffLoan(id: string, reason: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const loan = await db.staffLoan.findFirst({ where: { id: String(id), churchId: s.churchId }, select: { id: true, ref: true, staffId: true, status: true } });
  if (!loan) return { ok: false, error: "Loan not found." };
  if (loan.status !== "active") return { ok: false, error: "Only an active loan can be written off." };
  if (!String(reason ?? "").trim()) return { ok: false, error: "Say why it is being written off." };
  await db.staffLoan.update({ where: { id: loan.id }, data: { status: "written_off", note: String(reason).slice(0, 300) } });
  await writeEvent(db, { churchId: s.churchId, staffId: loan.staffId, action: "loan.written_off", actorId: s.userId, actorName: s.name, detail: `Wrote off ${loan.ref}: ${String(reason).slice(0, 200)}` });
  touch(`/app/staff/${loan.staffId}`);
  return { ok: true, message: `${loan.ref} written off` };
}

// ── Runs ──

export async function createPayrollRun(year: number, month: number, kind: string): Promise<ActionResult & { id?: string }> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const run = await db.$transaction((tx) => createRun(tx, { churchId: s.churchId, year: Number(year), month: Number(month), kind: kind === "supplementary" ? "supplementary" : "regular", actor: actorOf(s) }), { timeout: 60_000 });
    await audit(s, "create", "payroll", `Started payroll for ${periodLabel(run.year, run.month)}`, run.id);
    touch("/app/payroll");
    return { ok: true, id: run.id, message: `${run.title} started` };
  } catch (e) {
    return errorResult(e);
  }
}

export async function refreshPayrollRun(runId: string, version: number): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    await db.$transaction((tx) => refreshRun(tx, { churchId: s.churchId, runId: String(runId), actor: actorOf(s), version: Number(version) }), { timeout: 60_000 });
    touch(`/app/payroll/runs/${runId}`);
    return { ok: true, message: "Refreshed from pay setup" };
  } catch (e) {
    return errorResult(e);
  }
}

/** Shared by every line edit: the run must be a draft at the version the person saw; own-line edits are recorded. */
async function editLine(lineId: string, version: number, fn: (tx: Prisma.TransactionClient, line: { id: string; runId: string; staffId: string | null; staffName: string }) => Promise<void>): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const line = await db.payrollLine.findFirst({ where: { id: String(lineId), churchId: s.churchId }, select: { id: true, runId: true, staffId: true, staffName: true } });
    if (!line) return { ok: false, error: "Pay line not found." };
    await db.$transaction(async (tx) => {
      await touchDraft(tx, s.churchId, line.runId, actorOf(s), Number(version));
      await fn(tx, line);
      await recalcLine(tx, s.churchId, line.id);
      if (s.staffId && line.staffId === s.staffId) {
        // Editing your own pay makes the approval rule strict for this run.
        await writeEvent(tx, { churchId: s.churchId, runId: line.runId, staffId: line.staffId, action: "line.own_edit", actorId: s.userId, actorName: s.name, detail: "Edited their own pay line" });
      }
    }, { timeout: 30_000 });
    touch(`/app/payroll/runs/${line.runId}`);
    return { ok: true, message: "Saved" };
  } catch (e) {
    return errorResult(e);
  }
}

export async function updatePayLine(lineId: string, version: number, input: { unpaidDays?: number; note?: string; excluded?: boolean }): Promise<ActionResult> {
  return editLine(lineId, version, async (tx, line) => {
    const data: Prisma.PayrollLineUpdateInput = {};
    if (input.unpaidDays !== undefined) {
      const u = Math.round(Number(input.unpaidDays) * 2) / 2;
      if (!Number.isFinite(u) || u < 0 || u > 31) throw new PayrollError("Unpaid days must be between 0 and 31, in half days.");
      data.unpaidDays = String(u);
    }
    if (input.note !== undefined) data.note = String(input.note).slice(0, 300) || null;
    if (input.excluded !== undefined) data.excluded = !!input.excluded;
    await tx.payrollLine.update({ where: { id: line.id }, data });
  });
}

export async function addPayLineItem(lineId: string, version: number, item: { kind: string; code: string; label?: string; amount: string; taxable?: boolean; preTax?: boolean; remitted?: boolean }): Promise<ActionResult> {
  return editLine(lineId, version, async (tx, line) => {
    const kind = item.kind === "deduction" ? "deduction" : "earning";
    const amountP = toP(String(item.amount ?? ""));
    if (!(amountP > 0) || amountP > toP(10_000_000)) throw new PayrollError("Enter an amount above 0.");
    const codes = kind === "earning" ? ONEOFF_EARNING_CODES : DEDUCTION_CODES;
    const code = codes.some((c) => c.code === item.code) ? item.code : "other";
    const label = String(item.label ?? "").trim().slice(0, 60) || codes.find((c) => c.code === code)?.label || "Other";
    await tx.payrollLineItem.create({
      data: {
        churchId: (await tx.payrollLine.findUniqueOrThrow({ where: { id: line.id }, select: { churchId: true } })).churchId,
        lineId: line.id, kind, code, label, amount: fromP(amountP), source: "oneoff", sortOrder: 900,
        taxable: kind === "earning" ? item.taxable !== false : false,
        preTax: kind === "deduction" ? !!item.preTax : false,
        remitted: kind === "deduction" ? !!item.remitted || !!item.preTax : false,
      },
    });
  });
}

export async function removePayLineItem(itemId: string, version: number): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const item = await db.payrollLineItem.findFirst({ where: { id: String(itemId), churchId: a.session.churchId }, select: { id: true, lineId: true, source: true } });
  if (!item) return { ok: false, error: "That item was not found." };
  if (item.source !== "oneoff") return { ok: false, error: "Only one-off items can be removed here. Change regular pay in the staff profile, then refresh." };
  return editLine(item.lineId, version, async (tx) => {
    await tx.payrollLineItem.delete({ where: { id: item.id } });
  });
}

export async function submitPayrollRun(runId: string, version: number): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const warnings = await db.$transaction((tx) => submitRun(tx, { churchId: s.churchId, runId: String(runId), version: Number(version), actor: actorOf(s) }));
    const run = await db.payrollRun.findFirst({ where: { id: String(runId), churchId: s.churchId }, select: { year: true, month: true, headcount: true } });
    if (run) await audit(s, "update", "payroll", `Sent payroll for ${periodLabel(run.year, run.month)} for approval (${run.headcount} staff)`, String(runId));
    touch(`/app/payroll/runs/${runId}`, "/app/payroll");
    return { ok: true, message: "Sent for approval", warnings: warnings.map((w) => w.text) };
  } catch (e) {
    return errorResult(e);
  }
}

export async function sendBackPayrollRun(runId: string, version: number, note: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    await db.$transaction((tx) => sendBackRun(tx, { churchId: s.churchId, runId: String(runId), version: Number(version), actor: actorOf(s), note: String(note ?? "") }));
    touch(`/app/payroll/runs/${runId}`, "/app/payroll");
    return { ok: true, message: "Sent back to draft" };
  } catch (e) {
    return errorResult(e);
  }
}

export async function approvePayrollRun(runId: string, version: number): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const r = await db.$transaction((tx) => approveRun(tx, { churchId: s.churchId, runId: String(runId), version: Number(version), actor: actorOf(s) }));
    const run = await db.payrollRun.findFirst({ where: { id: String(runId), churchId: s.churchId }, select: { year: true, month: true, headcount: true } });
    if (run) await audit(s, "update", "payroll", `Approved payroll for ${periodLabel(run.year, run.month)} (${run.headcount} staff)${r.selfApproved ? ", self-approved" : ""}`, String(runId));
    touch(`/app/payroll/runs/${runId}`, "/app/payroll");
    return { ok: true, message: r.selfApproved ? "Approved (self-approved)" : "Approved" };
  } catch (e) {
    return errorResult(e);
  }
}

export async function markPayrollPaid(runId: string, version: number, input: { accountId: string; payDate: string; fundId?: string }): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const accountId = input.accountId ? (await db.churchAccount.findFirst({ where: { id: String(input.accountId), churchId: s.churchId }, select: { id: true } }))?.id ?? null : null;
    if (input.accountId && !accountId) return { ok: false, error: "That account was not found." };
    const payDate = dateOf(String(input.payDate ?? "")) ?? new Date();
    // Fund accounting is a Max feature like payroll, but follow the plan lock the same way createExpense does.
    const fundId = !s.planLocked?.includes("fund-accounting") && input.fundId ? String(input.fundId) : null;
    const restricted = fundId ? !!(await db.fund.findFirst({ where: { id: fundId, churchId: s.churchId, restricted: true }, select: { id: true } })) : false;
    const r = await db.$transaction(
      (tx) => markPaid(tx, { churchId: s.churchId, runId: String(runId), version: Number(version), actor: actorOf(s), accountId, payDate, fundId }),
      { timeout: 60_000, ...(restricted ? { isolationLevel: "Serializable" as const } : {}) },
    );
    const run = await db.payrollRun.findFirst({ where: { id: String(runId), churchId: s.churchId }, select: { year: true, month: true } });
    if (run) await audit(s, "update", "payroll", `Marked payroll for ${periodLabel(run.year, run.month)} as paid (${r.headcount} staff)`, String(runId));
    touch(`/app/payroll/runs/${runId}`, "/app/payroll", "/app/expenses", "/app/accounting");
    return { ok: true, message: "Marked as paid. Net pay is recorded in Expenses." };
  } catch (e) {
    return errorResult(e);
  }
}

export async function markPostingPaidOver(postingId: string, input: { accountId: string; date: string; reference?: string }): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const accountId = input.accountId ? (await db.churchAccount.findFirst({ where: { id: String(input.accountId), churchId: s.churchId }, select: { id: true } }))?.id ?? null : null;
    if (input.accountId && !accountId) return { ok: false, error: "That account was not found." };
    const exp = await db.$transaction((tx) => markRemitted(tx, { churchId: s.churchId, postingId: String(postingId), actor: actorOf(s), accountId, date: dateOf(String(input.date ?? "")) ?? new Date(), reference: String(input.reference ?? "").trim() || null }));
    await audit(s, "update", "payroll", `Recorded "${exp.description}" as paid over`, String(postingId));
    touch("/app/payroll", "/app/expenses", "/app/accounting");
    return { ok: true, message: "Recorded as paid over" };
  } catch (e) {
    return errorResult(e);
  }
}

export async function reversePayrollRun(runId: string, version: number, input: { mode: string; reason: string; confirmText: string }): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    const run = await db.payrollRun.findFirst({ where: { id: String(runId), churchId: s.churchId }, select: { year: true, month: true } });
    if (!run) return { ok: false, error: "Payroll not found." };
    const monthName = periodLabel(run.year, run.month).split(" ")[0].toUpperCase();
    if (String(input.confirmText ?? "").trim().toUpperCase() !== monthName) return { ok: false, error: `Type ${monthName} to confirm.` };
    const mode = input.mode === "returned" ? "returned" : "never_paid";
    await db.$transaction((tx) => reverseRun(tx, { churchId: s.churchId, runId: String(runId), version: Number(version), actor: actorOf(s), mode, reason: String(input.reason ?? "") }), { timeout: 60_000 });
    await audit(s, "update", "payroll", `Reversed payroll for ${periodLabel(run.year, run.month)}`, String(runId));
    touch(`/app/payroll/runs/${runId}`, "/app/payroll", "/app/expenses", "/app/accounting");
    return { ok: true, message: "Payroll reversed" };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deletePayrollDraft(runId: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  try {
    await db.$transaction((tx) => deleteDraftRun(tx, { churchId: s.churchId, runId: String(runId), actor: actorOf(s) }));
    touch("/app/payroll");
    return { ok: true, message: "Draft deleted" };
  } catch (e) {
    return errorResult(e);
  }
}

// ── Settings ──

export async function savePayrollSettings(fd: FormData): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const raw = Object.fromEntries(["statutoryMode", "ssnitEmployeePct", "ssnitEmployerPct", "tier1Pct", "tier2Pct", "ssnitMonthlyCap", "workingDaysRule", "fixedWorkingDays", "postingMode",
    "salaryCategory", "ssnitCategory", "payeCategory", "deductionsCategory", "loansCategory", "makerChecker", "payslipNote", "staffNoPrefix", "employerSsnitNo", "employerTin",
    "bonusTaxMode", "bonusRatePct", "bonusCapPct", "overtimeTaxMode", "overtimeLowPct", "overtimeHighPct", "overtimeQualifyMax"].map((k) => [k, String(fd.get(k) ?? "").trim()]));
  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." };
  const v = parsed.data;
  const accountRaw = str(fd, "defaultAccountId", 40);
  const defaultAccountId = accountRaw ? (await db.churchAccount.findFirst({ where: { id: accountRaw, churchId: s.churchId }, select: { id: true } }))?.id ?? null : null;
  await ensureSettings(db, s.churchId);
  await db.payrollSettings.update({
    where: { churchId: s.churchId },
    data: {
      statutoryMode: v.statutoryMode, ssnitEmployeePct: String(v.ssnitEmployeePct), ssnitEmployerPct: String(v.ssnitEmployerPct), tier1Pct: String(v.tier1Pct), tier2Pct: String(v.tier2Pct),
      ssnitMonthlyCap: v.ssnitMonthlyCap === "" || v.ssnitMonthlyCap === undefined ? null : String(v.ssnitMonthlyCap),
      workingDaysRule: v.workingDaysRule, fixedWorkingDays: v.fixedWorkingDays, postingMode: v.postingMode,
      salaryCategory: v.salaryCategory, ssnitCategory: v.ssnitCategory, payeCategory: v.payeCategory, deductionsCategory: v.deductionsCategory, loansCategory: v.loansCategory,
      makerChecker: v.makerChecker, payslipNote: v.payslipNote || null, staffNoPrefix: v.staffNoPrefix.toUpperCase(), employerSsnitNo: v.employerSsnitNo || null, employerTin: v.employerTin || null,
      defaultAccountId, portalOn: on(fd, "portalOn"), smsShowAmounts: on(fd, "smsShowAmounts"),
      selfClockOn: on(fd, "selfClockOn"), remindersOn: on(fd, "remindersOn"), budgetLinkOn: on(fd, "budgetLinkOn"),
      bonusTaxMode: v.bonusTaxMode, bonusRatePct: String(v.bonusRatePct), bonusCapPct: String(v.bonusCapPct),
      overtimeTaxMode: v.overtimeTaxMode, overtimeLowPct: String(v.overtimeLowPct), overtimeHighPct: String(v.overtimeHighPct),
      overtimeQualifyMax: v.overtimeQualifyMax === "" || v.overtimeQualifyMax === undefined ? null : String(v.overtimeQualifyMax),
    },
  });
  const d = DEFAULT_PAYROLL_RULES;
  const differs = v.ssnitEmployeePct !== d.ssnitEePct || v.ssnitEmployerPct !== d.ssnitErPct || v.tier1Pct !== d.tier1Pct || v.tier2Pct !== d.tier2Pct;
  await writeEvent(db, { churchId: s.churchId, action: "settings.saved", actorId: s.userId, actorName: s.name, detail: `Saved payroll settings${differs ? " (rates differ from the usual Ghana rates)" : ""}` });
  await audit(s, "update", "payroll-settings", "Updated payroll settings");
  touch("/app/payroll/settings", "/app/payroll");
  return { ok: true, message: "Settings saved", warnings: differs ? ["Your SSNIT rates differ from the usual Ghana rates. Please confirm them with your accountant."] : [] };
}

export async function savePayeBandSet(input: { id?: string; name: string; effectiveFrom: string; bands: { width: number | null; pct: number }[]; note?: string }): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const parsed = BandsSchema.safeParse(input.bands);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the bands." };
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give the band set a name." };
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveFrom)) ? new Date(`${input.effectiveFrom}T00:00:00.000Z`) : null;
  if (!from) return { ok: false, error: "Choose the date these bands start." };
  const data = { name, effectiveFrom: from, bands: parsed.data as unknown as Prisma.InputJsonValue, note: String(input.note ?? "").slice(0, 300) || null };
  if (input.id) {
    const r = await db.payeBandSet.updateMany({ where: { id: String(input.id), churchId: s.churchId }, data });
    if (r.count !== 1) return { ok: false, error: "Band set not found." };
  } else {
    await db.payeBandSet.create({ data: { ...data, churchId: s.churchId } });
  }
  await writeEvent(db, { churchId: s.churchId, action: "bands.saved", actorId: s.userId, actorName: s.name, detail: `Saved PAYE bands "${name}" from ${input.effectiveFrom}` });
  touch("/app/payroll/settings");
  return { ok: true, message: "PAYE bands saved. New payrolls use them; existing ones keep their own." };
}

/** Add the built-in Ghana bands as a band set the church can see and edit. */
export async function addDefaultBandSet(): Promise<ActionResult> {
  return savePayeBandSet({ name: GHANA_PAYE_BANDS_NAME, effectiveFrom: "2024-01-01", bands: GHANA_PAYE_BANDS_2024 });
}

export async function deletePayeBandSet(id: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) return a;
  const s = a.session;
  const set = await db.payeBandSet.findFirst({ where: { id: String(id), churchId: s.churchId }, select: { id: true, name: true } });
  if (!set) return { ok: false, error: "Band set not found." };
  const used = await db.payrollRun.findFirst({ where: { churchId: s.churchId, status: { in: ["draft", "review", "approved"] }, rules: { path: ["bandSetName"], equals: set.name } }, select: { title: true } });
  if (used) return { ok: false, error: `${used.title} uses these bands. Finish or refresh it first.` };
  await db.payeBandSet.delete({ where: { id: set.id } });
  await writeEvent(db, { churchId: s.churchId, action: "bands.deleted", actorId: s.userId, actorName: s.name, detail: `Deleted PAYE bands "${set.name}"` });
  touch("/app/payroll/settings");
  return { ok: true, message: "Band set deleted" };
}

export async function saveHoliday(date: string, name: string): Promise<ActionResult> {
  const a = await payrollActor("manage");
  if (!a.ok) {
    // Staff managers keep the leave calendar too.
    const { staffActor } = await import("@/lib/payroll/access");
    const b = await staffActor("manage");
    if (!b.ok) return a;
  }
  const { getSession } = await import("@/lib/auth");
  const s = (await getSession())!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ok: false, error: "Choose a date." };
  const label = String(name ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, error: "Name the holiday." };
  const d = new Date(`${date}T00:00:00.000Z`);
  await db.payrollHoliday.upsert({ where: { churchId_date: { churchId: s.churchId, date: d } }, update: { name: label }, create: { churchId: s.churchId, date: d, name: label } });
  touch("/app/payroll/settings", "/app/staff");
  return { ok: true, message: "Holiday saved" };
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  const { staffActor } = await import("@/lib/payroll/access");
  const a = await staffActor("manage");
  const b = await payrollActor("manage");
  if (!a.ok && !b.ok) return b;
  const s = a.ok ? a.session : (b as { ok: true; session: { churchId: string } }).session;
  await db.payrollHoliday.deleteMany({ where: { id: String(id), churchId: s.churchId } });
  touch("/app/payroll/settings", "/app/staff");
  return { ok: true, message: "Holiday removed" };
}
