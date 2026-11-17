import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { postExpense, resolveLinks, round2, safeRevalidate, type Ctx, type ExpenseInput, type Tx } from "@/lib/expenses/post";

/**
 * Requests for money. A request is NOT an expense: it waits in ExpenseRequest until finance approves and pays it,
 * and only then becomes an Expense (through postExpense). So every total in the app stays correct while it waits.
 *
 * pending -> approved -> paid, or pending -> rejected, or pending/approved -> cancelled.
 * Each step is claimed with a conditional updateMany, so two people clicking at once can never pay it twice.
 */

export type RequestInput = {
  description: string;
  amount: number;
  category?: string | null;
  vendorName?: string | null;
  vendorId?: string | null;
  budgetId?: string | null;
  budgetItemId?: string | null;
  accountId?: string | null;
  fundId?: string | null;
  assetId?: string | null;
  neededBy?: Date | null;
  attachmentUrl?: string | null;
  note?: string | null;
  /** fuel (VehicleFuel id) | maintenance (MaintenanceRecord id) | repair (MaintenanceRequest id) */
  source?: string | null;
  sourceId?: string | null;
};

export type Result = { ok: true; id: string } | { ok: false; error: string };

export async function createRequest(ctx: Ctx, input: RequestInput, tx?: Tx): Promise<Result> {
  const description = String(input.description ?? "").trim().slice(0, 300);
  if (!description) return { ok: false, error: "Say what the money is for." };
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount above zero." };
  const links = await resolveLinks(ctx, input);
  if (!links.ok) return links;
  const { r } = links;
  const client = tx ?? db;
  const row = await client.expenseRequest.create({
    data: {
      churchId: ctx.churchId,
      description,
      amount,
      category: String(input.category ?? "").trim().slice(0, 60) || "General",
      vendorName: input.vendorName?.trim() || r.vendorName,
      vendorId: r.vendorId,
      budgetId: r.budgetId,
      budgetItemId: r.budgetItemId,
      accountId: r.accountId,
      fundId: r.fund?.id ?? null,
      assetId: r.assetId,
      neededBy: input.neededBy ?? null,
      attachmentUrl: input.attachmentUrl || null,
      note: input.note?.trim() || null,
      source: input.source ?? null,
      sourceId: input.sourceId ?? null,
      requestedById: ctx.userId,
      requestedByName: ctx.name,
    },
    select: { id: true },
  });
  if (!tx) {
    await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "expenseRequest", entityId: row.id, detail: `Asked for GHS ${amount}: ${description}` });
    safeRevalidate("/app/expenses");
  }
  return { ok: true, id: row.id };
}

export async function decideRequest(ctx: Ctx, id: string, decision: "approve" | "reject", note?: string | null): Promise<Result> {
  if (!ctx.canPostExpenses) return { ok: false, error: "Only people who manage Expenses can approve requests." };
  const req = await db.expenseRequest.findFirst({ where: { id, churchId: ctx.churchId }, select: { id: true, status: true, requestedById: true, description: true, amount: true } });
  if (!req) return { ok: false, error: "That request was not found." };
  if (req.requestedById === ctx.userId && !ctx.isOwner) return { ok: false, error: "Someone else has to approve your own request." };
  if (decision === "reject" && !note?.trim()) return { ok: false, error: "Give a short reason so the person knows why." };
  const claim = await db.expenseRequest.updateMany({
    where: { id, churchId: ctx.churchId, status: "pending" },
    data: { status: decision === "approve" ? "approved" : "rejected", decidedById: ctx.userId, decidedByName: ctx.name, decidedAt: new Date(), decisionNote: note?.trim() || null },
  });
  if (claim.count === 0) return { ok: false, error: "This request has already been decided." };
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: decision === "approve" ? "approve" : "reject", entity: "expenseRequest", entityId: id, detail: `${decision === "approve" ? "Approved" : "Declined"} request for GHS ${req.amount}: ${req.description}` });
  safeRevalidate("/app/expenses");
  return { ok: true, id };
}

export type PayOverrides = Partial<Pick<ExpenseInput, "accountId" | "paymentMethod" | "receiptUrl" | "receiptRef" | "date" | "fundId" | "budgetItemId" | "budgetId" | "category" | "amount" | "description" | "vendorId" | "vendor">>;

/** Link the new expense back to the fuel row or repair it came from. */
async function linkSource(tx: Tx, churchId: string, source: string | null, sourceId: string | null, expenseId: string) {
  if (!source || !sourceId) return;
  if (source === "fuel") await tx.vehicleFuel.updateMany({ where: { id: sourceId, churchId, expenseId: null }, data: { expenseId } });
  else if (source === "maintenance") await tx.maintenanceRecord.updateMany({ where: { id: sourceId, churchId, expenseId: null }, data: { expenseId } });
  else if (source === "repair") await tx.maintenanceRequest.updateMany({ where: { id: sourceId, churchId, expenseId: null }, data: { expenseId } });
}

export async function payRequest(ctx: Ctx, id: string, overrides: PayOverrides = {}): Promise<Result> {
  if (!ctx.canPostExpenses) return { ok: false, error: "Only people who manage Expenses can pay requests." };
  const req = await db.expenseRequest.findFirst({ where: { id, churchId: ctx.churchId } });
  if (!req) return { ok: false, error: "That request was not found." };
  if (req.status === "rejected") return { ok: false, error: "A declined request cannot be paid." };
  if (req.status === "paid") return { ok: false, error: "This request has already been paid." };
  if (req.status !== "approved") return { ok: false, error: "Approve the request before paying it." };

  // Claim it first: only one payer gets past this line.
  const claim = await db.expenseRequest.updateMany({ where: { id, churchId: ctx.churchId, status: "approved", expenseId: null }, data: { status: "paid" } });
  if (claim.count === 0) return { ok: false, error: "This request has already been paid." };

  const res = await postExpense(ctx, {
    description: overrides.description ?? req.description,
    amount: overrides.amount ?? req.amount,
    category: overrides.category ?? req.category,
    vendor: overrides.vendor ?? req.vendorName,
    vendorId: overrides.vendorId ?? req.vendorId,
    accountId: overrides.accountId ?? req.accountId,
    fundId: overrides.fundId ?? req.fundId,
    budgetId: overrides.budgetId ?? req.budgetId,
    budgetItemId: overrides.budgetItemId ?? req.budgetItemId,
    assetId: req.assetId,
    paymentMethod: overrides.paymentMethod ?? null,
    receiptUrl: overrides.receiptUrl ?? req.attachmentUrl,
    receiptRef: overrides.receiptRef ?? null,
    date: overrides.date ?? new Date(),
    source: req.source ?? "request",
    sourceId: req.source ? req.sourceId : req.id,
    notes: req.note,
    approvedBy: req.decidedByName,
  }, async (tx, expenseId) => {
    await tx.expenseRequest.updateMany({ where: { id, churchId: ctx.churchId }, data: { expenseId } });
    await linkSource(tx, ctx.churchId, req.source, req.sourceId, expenseId);
  });

  if (!res.ok) {
    await db.expenseRequest.updateMany({ where: { id, churchId: ctx.churchId, status: "paid", expenseId: null }, data: { status: "approved" } });
    return res;
  }
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "pay", entity: "expenseRequest", entityId: id, detail: `Paid request for GHS ${req.amount}: ${req.description}` });
  return { ok: true, id: res.id };
}

export async function cancelRequest(ctx: Ctx, id: string): Promise<Result> {
  const req = await db.expenseRequest.findFirst({ where: { id, churchId: ctx.churchId }, select: { requestedById: true, description: true } });
  if (!req) return { ok: false, error: "That request was not found." };
  if (req.requestedById !== ctx.userId && !ctx.canPostExpenses) return { ok: false, error: "Only the person who asked, or finance, can cancel it." };
  const claim = await db.expenseRequest.updateMany({ where: { id, churchId: ctx.churchId, status: { in: ["pending", "approved"] } }, data: { status: "cancelled" } });
  if (claim.count === 0) return { ok: false, error: "This request can no longer be cancelled." };
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "cancel", entity: "expenseRequest", entityId: id, detail: `Cancelled request: ${req.description}` });
  safeRevalidate("/app/expenses");
  return { ok: true, id };
}
