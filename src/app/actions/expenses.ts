"use server";

import { revalidatePath } from "next/cache";
import { requireManage, requireSession, assertCanWrite, assertCanDelete, planLockFor } from "@/lib/auth";
import { hasSection, canManage, type Session } from "@/lib/permissions";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { RecycleBin, moveToBin } from "@/lib/recycle-bin";
import { sendEmail } from "@/lib/integrations/email";
import { ctxFrom, postExpense, updateExpenseCore, lockedExpenseReason, round2, type ExpenseInput } from "@/lib/expenses/post";
import { createRequest, decideRequest, payRequest, cancelRequest } from "@/lib/expenses/requests";
import { recordRecurring } from "@/lib/expenses/recurring";
import { FREQUENCIES } from "@/lib/expenses/recurrence";
import { str, strOrNull, num, dateOf, bool, errorText } from "@/lib/form-read";
import { readPhoto } from "@/lib/uploads/photo-field";
import { ownedId } from "@/lib/tenant";

export type ActionResult = { ok: boolean; error?: string; id?: string; queued?: boolean };

const real = (e: string | null | undefined): e is string => !!e && !e.endsWith("@invite.worshiphq.app");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function writer() {
  const session = await requireManage("expenses");
  assertCanWrite(session, "expenses");
  return session;
}

function expenseFields(fd: FormData): ExpenseInput {
  return {
    description: str(fd, "description"),
    amount: num(fd, "amount") ?? 0,
    category: str(fd, "category"),
    date: dateOf(fd, "date"),
    vendor: strOrNull(fd, "vendor"),
    vendorId: strOrNull(fd, "vendorId"),
    receiptRef: strOrNull(fd, "receiptRef"),
    paymentMethod: strOrNull(fd, "paymentMethod"),
    accountId: strOrNull(fd, "accountId"),
    fundId: strOrNull(fd, "fundId"),
    budgetId: strOrNull(fd, "budgetId"),
    budgetItemId: strOrNull(fd, "budgetItemId"),
    notes: strOrNull(fd, "notes"),
    // Free-text "Approved by" is no longer offered on new expenses; older records keep theirs.
  };
}

/** Email whoever can approve: Owner and Admin, plus anyone whose custom role manages Expenses. */
async function tellApprovers(session: Session, subject: string, lines: string[]) {
  const users = await db.user.findMany({ where: { churchId: session.churchId, id: { not: session.userId } }, select: { email: true, role: true, customRole: { select: { manageSections: true } } } });
  const to = [...new Set(users.filter((u) => ["Owner", "Admin"].includes(u.role) || (u.customRole?.manageSections ?? []).includes("expenses")).map((u) => u.email).filter(real))];
  if (!to.length) return;
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/expenses?tab=approvals`;
  await sendEmail({
    to, subject,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1c1a16"><h2 style="margin:0 0 6px;color:#0d7377">A request for money</h2><p style="margin:0 0 14px;color:#6b6456">${esc(session.churchName)}</p>${lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join("")}<p style="margin-top:18px"><a href="${url}" style="background:#0d7377;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Review it</a></p></div>`,
  }).catch(() => {});
}

export async function createExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const ctx = ctxFrom(session);
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    const input = { ...expenseFields(fd), receiptUrl: receipt.value ?? null };

    // Above the church's approval limit, anyone but the Main Admin sends it for approval instead.
    const church = await db.church.findUnique({ where: { id: session.churchId }, select: { expenseApprovalOver: true } });
    const limit = church?.expenseApprovalOver;
    if (limit != null && limit > 0 && session.role !== "Owner" && round2(input.amount) > limit) {
      const r = await createRequest(ctx, {
        description: input.description, amount: input.amount, category: input.category, vendorName: input.vendor, vendorId: input.vendorId,
        accountId: input.accountId, fundId: input.fundId, budgetId: input.budgetId, budgetItemId: input.budgetItemId, attachmentUrl: input.receiptUrl, note: input.notes,
      });
      if (!r.ok) return r;
      await tellApprovers(session, `Approval needed: GHS ${input.amount} - ${session.churchName}`, [`${session.name} recorded GHS ${input.amount} for ${input.description}.`, `Expenses above GHS ${limit} need approval.`]);
      return { ok: true, id: r.id, queued: true };
    }
    const res = await postExpense(ctx, input);
    return res.ok ? { ok: true, id: res.id } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function updateExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    const id = str(fd, "id");
    const res = await updateExpenseCore(ctxFrom(session), id, { ...expenseFields(fd), ...(receipt.value !== undefined ? { receiptUrl: receipt.value } : {}) });
    return res.ok ? { ok: true, id } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function attachExpenseReceipt(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const id = await ownedId("expense", str(fd, "id"), session.churchId);
    if (!id) return { ok: false, error: "That expense was not found." };
    fd.set("receiptChanged", "1");
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    await db.expense.updateMany({ where: { id, churchId: session.churchId }, data: { receiptUrl: receipt.value ?? null } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "expense", entityId: id, detail: receipt.value ? "Added a receipt photo" : "Removed the receipt photo" });
    revalidatePath("/app/expenses");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const id = str(fd, "id");
    const expense = await db.expense.findFirst({ where: { id, churchId: session.churchId }, select: { description: true, amount: true, vendor: true } });
    if (!expense) return { ok: false, error: "That expense was not found." };
    const locked = await lockedExpenseReason(session.churchId, id);
    if (locked) return { ok: false, error: locked };

    await RecycleBin.captureExpense(session, id);
    await db.expense.deleteMany({ where: { id, churchId: session.churchId } });

    // Clean up any legacy mirror Transaction from before expenses were single-sourced.
    const txDesc = `${expense.description}${expense.vendor ? ` (${expense.vendor})` : ""}`;
    await db.transaction.deleteMany({ where: { churchId: session.churchId, description: txDesc, amount: -expense.amount, accountId: null, fund: "General" } });

    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "expense", entityId: id, detail: `Deleted GHS ${expense.amount} expense: ${expense.description}` });
    revalidatePath("/app/expenses");
    revalidatePath("/app/accounting");
    revalidatePath("/app/budgets");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/**
 * Ask for money. Open to anyone who can see Expenses, and to a department budget leader against their own
 * department's budget. Nothing is spent until finance approves and pays it.
 */
export async function requestExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCanWrite(session);
    const budgetId = strOrNull(fd, "budgetId");
    const budgetItemId = strOrNull(fd, "budgetItemId");
    const viewer = hasSection(session, "expenses") && !planLockFor(session, "expenses");
    if (!viewer) {
      if (!session.budgetDepartmentId) return { ok: false, error: "Your role cannot ask for money here." };
      const target = budgetItemId
        ? await db.budgetItem.findFirst({ where: { id: budgetItemId, churchId: session.churchId }, select: { budget: { select: { departmentId: true } } } }).then((x) => x?.budget)
        : budgetId ? await db.budget.findFirst({ where: { id: budgetId, churchId: session.churchId }, select: { departmentId: true } }) : null;
      if (!target || target.departmentId !== session.budgetDepartmentId) return { ok: false, error: "Choose a line from your department's budget." };
    }
    const attachment = await readPhoto(fd, "attachment", "receipts");
    if (!attachment.ok) return attachment;
    const r = await createRequest(ctxFrom(session), {
      description: str(fd, "description"), amount: num(fd, "amount") ?? 0, category: str(fd, "category"), vendorName: strOrNull(fd, "vendor"),
      vendorId: strOrNull(fd, "vendorId"), budgetId, budgetItemId, neededBy: dateOf(fd, "neededBy"), attachmentUrl: attachment.value ?? null, note: strOrNull(fd, "note"),
    });
    if (!r.ok) return r;
    await tellApprovers(session, `Request: GHS ${num(fd, "amount")} - ${session.churchName}`, [`${session.name} is asking for GHS ${num(fd, "amount")}.`, `For: ${str(fd, "description")}`]);
    return { ok: true, id: r.id, queued: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function decideExpenseRequest(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const decision = str(fd, "decision") === "reject" ? "reject" : "approve";
    const r = await decideRequest(ctxFrom(session), str(fd, "id"), decision, strOrNull(fd, "note"));
    if (!r.ok) return r;
    // The requester hears the outcome.
    const req = await db.expenseRequest.findFirst({ where: { id: r.id, churchId: session.churchId }, select: { requestedById: true, description: true, amount: true, decisionNote: true } });
    const who = req?.requestedById ? await db.user.findFirst({ where: { id: req.requestedById, churchId: session.churchId }, select: { email: true } }) : null;
    if (req && real(who?.email)) {
      await sendEmail({
        to: who!.email, subject: `Your request was ${decision === "approve" ? "approved" : "declined"} - ${session.churchName}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px"><p>${esc(`GHS ${req.amount} for ${req.description} was ${decision === "approve" ? "approved" : "declined"} by ${session.name}.`)}</p>${req.decisionNote ? `<p>${esc(req.decisionNote)}</p>` : ""}</div>`,
      }).catch(() => {});
    }
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Pay an approved request (or approve and pay in one step). */
export async function payExpenseRequest(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const ctx = ctxFrom(session);
    const id = str(fd, "id");
    if (bool(fd, "approveFirst")) {
      const cur = await db.expenseRequest.findFirst({ where: { id, churchId: session.churchId }, select: { status: true } });
      if (cur?.status === "pending") {
        const d = await decideRequest(ctx, id, "approve", null);
        if (!d.ok) return d;
      }
    }
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    const r = await payRequest(ctx, id, {
      accountId: strOrNull(fd, "accountId"), paymentMethod: strOrNull(fd, "paymentMethod"), receiptRef: strOrNull(fd, "receiptRef"), date: dateOf(fd, "date"),
      ...(receipt.value ? { receiptUrl: receipt.value } : {}),
      ...(num(fd, "amount") ? { amount: num(fd, "amount")! } : {}),
    });
    return r.ok ? { ok: true, id: r.id } : r;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function cancelExpenseRequest(fd: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCanWrite(session);
    return await cancelRequest(ctxFrom(session), str(fd, "id")).then((r) => (r.ok ? { ok: true, id: r.id } : r));
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function saveRecurringExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const ctx = ctxFrom(session);
    const description = str(fd, "description");
    const amount = round2(num(fd, "amount") ?? 0);
    const nextDue = dateOf(fd, "nextDue");
    if (!description) return { ok: false, error: "Say what it is for (for example Rent)." };
    if (!(amount > 0)) return { ok: false, error: "Enter an amount above zero." };
    if (!nextDue) return { ok: false, error: "Choose when it is next due." };
    const frequency = FREQUENCIES.some((f) => f.key === str(fd, "frequency")) ? str(fd, "frequency") : "monthly";
    const accountId = await ownedId("churchAccount", strOrNull(fd, "accountId"), session.churchId);
    const vendorId = await ownedId("vendor", strOrNull(fd, "vendorId"), session.churchId);
    const fundId = ctx.fundAccounting ? await ownedId("fund", strOrNull(fd, "fundId"), session.churchId) : null;
    let budgetId: string | null = null, budgetItemId: string | null = null;
    if (ctx.budgetsOn && strOrNull(fd, "budgetItemId")) {
      const item = await db.budgetItem.findFirst({ where: { id: str(fd, "budgetItemId"), churchId: session.churchId }, select: { id: true, budgetId: true } });
      if (!item) return { ok: false, error: "That budget line was not found." };
      budgetItemId = item.id; budgetId = item.budgetId;
    }
    const data = {
      description, amount, category: str(fd, "category") || "General", vendorName: strOrNull(fd, "vendor"), vendorId, accountId, fundId, budgetId, budgetItemId,
      paymentMethod: strOrNull(fd, "paymentMethod"), frequency, anchorDay: frequency === "weekly" ? null : nextDue.getUTCDate(), nextDue, endsAt: dateOf(fd, "endsAt"),
      active: fd.has("active") ? bool(fd, "active") : true,
    };
    const id = strOrNull(fd, "id");
    let savedId: string;
    if (id) {
      const own = await ownedId("recurringExpense", id, session.churchId);
      if (!own) return { ok: false, error: "That recurring expense was not found." };
      await db.recurringExpense.update({ where: { id: own }, data });
      savedId = own;
    } else {
      savedId = (await db.recurringExpense.create({ data: { churchId: session.churchId, createdById: session.userId, ...data }, select: { id: true } })).id;
    }
    await logAudit({ churchId: session.churchId, userId: session.userId, action: id ? "update" : "create", entity: "recurringExpense", entityId: savedId, detail: `${description}: GHS ${amount} ${frequency}` });
    revalidatePath("/app/expenses");
    return { ok: true, id: savedId };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function recordRecurringNow(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const r = await recordRecurring(ctxFrom(session), str(fd, "id"));
    return r.ok ? { ok: true, id: r.id } : r;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function pauseRecurringExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const id = await ownedId("recurringExpense", str(fd, "id"), session.churchId);
    if (!id) return { ok: false, error: "That recurring expense was not found." };
    await db.recurringExpense.updateMany({ where: { id, churchId: session.churchId }, data: { active: bool(fd, "active") } });
    revalidatePath("/app/expenses");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteRecurringExpense(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const id = await ownedId("recurringExpense", str(fd, "id"), session.churchId);
    if (!id) return { ok: false, error: "That recurring expense was not found." };
    await moveToBin(session, "recurringExpense", "RecurringExpense", id);
    await db.recurringExpense.deleteMany({ where: { id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "recurringExpense", entityId: id, detail: "Removed a recurring expense" });
    revalidatePath("/app/expenses");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Add or edit a payee. Anyone who can record expenses or report maintenance costs may add one. */
export async function saveVendor(fd: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const section = ["expenses", "maintenance", "vehicles"].find((s) => canManage(session, s) && !planLockFor(session, s));
    if (!section) return { ok: false, error: "Your role cannot add payees." };
    assertCanWrite(session, section);
    const name = str(fd, "name").slice(0, 120);
    if (!name) return { ok: false, error: "Enter the payee's name." };
    const data = { name, phone: strOrNull(fd, "phone"), momoNumber: strOrNull(fd, "momoNumber"), category: strOrNull(fd, "category"), notes: strOrNull(fd, "notes") };
    const id = strOrNull(fd, "id");
    if (id) {
      const own = await ownedId("vendor", id, session.churchId);
      if (!own) return { ok: false, error: "That payee was not found." };
      await db.vendor.update({ where: { id: own }, data }).catch(() => { throw new Error(`${name} is already on your payee list.`); });
      return { ok: true, id: own };
    }
    const existing = await db.vendor.findFirst({ where: { churchId: session.churchId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (existing) return { ok: true, id: existing.id };
    const v = await db.vendor.create({ data: { churchId: session.churchId, ...data }, select: { id: true } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "vendor", entityId: v.id, detail: `Added payee ${name}` });
    revalidatePath("/app/expenses");
    return { ok: true, id: v.id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Expenses above this amount need approval (empty = off). Main Admin and Admins only. */
export async function setApprovalThreshold(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    if (session.role !== "Owner" && session.role !== "Admin") return { ok: false, error: "Only the Main Admin or an Admin can change this." };
    const n = num(fd, "amount");
    const value = n != null && n > 0 ? round2(n) : null;
    await db.church.update({ where: { id: session.churchId }, data: { expenseApprovalOver: value } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "settings", detail: value ? `Expenses above GHS ${value} now need approval` : "Expense approval limit switched off" });
    revalidatePath("/app/expenses");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
