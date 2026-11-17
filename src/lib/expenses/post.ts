import "server-only";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ownedId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { featureForSection } from "@/lib/plan-gate";
import { canManage, type Session } from "@/lib/permissions";
import { PAYMENT_METHOD_KEYS } from "@/lib/assets/categories";

/**
 * The ONLY place that writes an Expense row. Fuel, repairs, paid requests, recurring bills, asset purchases and
 * the Expenses form all come through here, so every check (account, fund balance, budget line, payee, asset)
 * is applied the same way and the Expense table stays the single source of truth for money spent.
 *
 * It never writes a BudgetEntry or a Transaction: a linked budget counts its linked expenses directly,
 * and account balances already subtract expenses. Writing either would count the money twice.
 */

export type Ctx = {
  churchId: string;
  userId: string;
  name: string;
  /** May record an expense straight away (manage Expenses, plan includes it). Otherwise costs become requests. */
  canPostExpenses: boolean;
  /** Fund accounting (Max): funds and their restrictions apply. */
  fundAccounting: boolean;
  /** Budgets (Max): an expense can be linked to a budget line. */
  budgetsOn: boolean;
  /** Main Admin: can approve their own requests and is never queued for approval. */
  isOwner?: boolean;
};

type SessionLike = Pick<Session, "churchId" | "userId" | "name" | "manageSections" | "exactSections" | "planLocked" | "isDemo" | "role" | "impersonating">;

const locked = (s: SessionLike, feature: string) => !s.impersonating && !!s.planLocked?.includes(feature);

/** Build the service context from a signed-in session. */
export function ctxFrom(session: SessionLike): Ctx {
  const expFeature = featureForSection("expenses");
  return {
    churchId: session.churchId,
    userId: session.userId,
    name: session.name,
    canPostExpenses: !session.isDemo && canManage(session, "expenses") && !(expFeature && locked(session, expFeature)),
    fundAccounting: session.isDemo || !locked(session, "fund-accounting"),
    budgetsOn: session.isDemo || !locked(session, "budgets"),
    isOwner: session.role === "Owner",
  };
}

export type ExpenseInput = {
  description: string;
  amount: number;
  category?: string | null;
  date?: Date | null;
  vendor?: string | null;
  vendorId?: string | null;
  receiptRef?: string | null;
  receiptUrl?: string | null;
  paymentMethod?: string | null;
  accountId?: string | null;
  fundId?: string | null;
  budgetId?: string | null;
  budgetItemId?: string | null;
  assetId?: string | null;
  source?: string | null;
  sourceId?: string | null;
  notes?: string | null;
  approvedBy?: string | null;
};

export type PostResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fund?: { name: string; left: number } };

export type Tx = Prisma.TransactionClient;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Revalidate when running inside a request; a no-op in scripts and tests. */
export function safeRevalidate(...paths: string[]) {
  for (const p of paths) {
    try { revalidatePath(p); } catch { /* outside a request (QA scripts) */ }
  }
}

type Resolved = {
  accountId: string | null;
  fund: { id: string; name: string; restricted: boolean } | null;
  budgetId: string | null;
  budgetItemId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  assetId: string | null;
};

/** Check every linked id belongs to this church (and the budget line to the budget). */
export async function resolveLinks(ctx: Ctx, input: Pick<ExpenseInput, "accountId" | "fundId" | "budgetId" | "budgetItemId" | "vendorId" | "assetId">): Promise<{ ok: true; r: Resolved } | { ok: false; error: string }> {
  const { churchId } = ctx;
  let accountId: string | null = null;
  if (input.accountId) {
    accountId = await ownedId("churchAccount", input.accountId, churchId);
    if (!accountId) return { ok: false, error: "That account was not found." };
  }
  let fund: Resolved["fund"] = null;
  if (ctx.fundAccounting && input.fundId) {
    fund = await db.fund.findFirst({ where: { id: input.fundId, churchId }, select: { id: true, name: true, restricted: true } });
    if (!fund) return { ok: false, error: "That fund was not found." };
  }
  let budgetId: string | null = null, budgetItemId: string | null = null;
  if (ctx.budgetsOn && (input.budgetId || input.budgetItemId)) {
    if (input.budgetItemId) {
      const item = await db.budgetItem.findFirst({ where: { id: input.budgetItemId, churchId }, select: { id: true, budgetId: true } });
      if (!item) return { ok: false, error: "That budget line was not found." };
      if (input.budgetId && input.budgetId !== item.budgetId) return { ok: false, error: "That budget line belongs to a different budget." };
      budgetItemId = item.id;
      budgetId = item.budgetId;
    } else {
      budgetId = await ownedId("budget", input.budgetId, churchId);
      if (!budgetId) return { ok: false, error: "That budget was not found." };
    }
  }
  let vendorId: string | null = null, vendorName: string | null = null;
  if (input.vendorId) {
    const v = await db.vendor.findFirst({ where: { id: input.vendorId, churchId }, select: { id: true, name: true } });
    if (!v) return { ok: false, error: "That payee was not found." };
    vendorId = v.id;
    vendorName = v.name;
  }
  let assetId: string | null = null;
  if (input.assetId) {
    assetId = await ownedId("asset", input.assetId, churchId);
    if (!assetId) return { ok: false, error: "That item was not found." };
  }
  return { ok: true, r: { accountId, fund, budgetId, budgetItemId, vendorId, vendorName, assetId } };
}

/** Money given to a fund minus what has been spent from it (optionally leaving one expense out). */
export async function fundBalance(tx: Tx | typeof db, churchId: string, fundId: string, excludeExpenseId?: string): Promise<number> {
  const [given, spent] = await Promise.all([
    tx.gift.aggregate({ where: { churchId, fundId }, _sum: { amount: true } }),
    tx.expense.aggregate({ where: { churchId, fundId, ...(excludeExpenseId ? { id: { not: excludeExpenseId } } : {}) }, _sum: { amount: true } }),
  ]);
  return Number(given._sum.amount ?? 0) - Number(spent._sum.amount ?? 0);
}

class FundBlocked extends Error {
  constructor(public fundName: string, public left: number) { super("fund"); }
}

const isSerializationError = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2034" || e.code === "40001");

/** Run `fn` in a transaction; serializable (with one retry on contention) when a restricted fund is involved. */
export async function inTx<T>(serializable: boolean, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const opts = serializable ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 } : { timeout: 15_000 };
  try {
    return await db.$transaction(fn, opts);
  } catch (e) {
    if (serializable && isSerializationError(e)) return db.$transaction(fn, opts);
    throw e;
  }
}

export function cleanMethod(m: string | null | undefined): string | null {
  return m && PAYMENT_METHOD_KEYS.includes(m) ? m : null;
}

export async function postExpense(ctx: Ctx, input: ExpenseInput, link?: (tx: Tx, expenseId: string) => Promise<void>): Promise<PostResult> {
  const description = String(input.description ?? "").trim().slice(0, 300);
  if (!description) return { ok: false, error: "Say what the money was for." };
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount above zero." };
  if (amount > 1_000_000_000) return { ok: false, error: "That amount is too large." };

  const links = await resolveLinks(ctx, input);
  if (!links.ok) return links;
  const { r } = links;

  const data: Prisma.ExpenseUncheckedCreateInput = {
    churchId: ctx.churchId,
    description,
    amount,
    category: String(input.category ?? "").trim().slice(0, 60) || "General",
    vendor: (input.vendor ?? "").trim() || r.vendorName,
    vendorId: r.vendorId,
    receiptRef: input.receiptRef?.trim() || null,
    receiptUrl: input.receiptUrl || null,
    paymentMethod: cleanMethod(input.paymentMethod),
    approvedBy: input.approvedBy?.trim() || null,
    accountId: r.accountId,
    fundId: r.fund?.id ?? null,
    budgetId: r.budgetId,
    budgetItemId: r.budgetItemId,
    assetId: r.assetId,
    source: input.source ?? null,
    sourceId: input.sourceId ?? null,
    notes: input.notes?.trim() || null,
    createdById: ctx.userId,
    createdByName: ctx.name,
    date: input.date && !Number.isNaN(input.date.getTime()) ? input.date : new Date(),
  };

  let id: string;
  try {
    id = await inTx(!!r.fund?.restricted, async (tx) => {
      if (r.fund?.restricted) {
        const balance = await fundBalance(tx, ctx.churchId, r.fund.id);
        if (amount > balance + 0.004) throw new FundBlocked(r.fund.name, Math.max(0, round2(balance)));
      }
      const row = await tx.expense.create({ data, select: { id: true } });
      if (link) await link(tx, row.id);
      return row.id;
    });
  } catch (e) {
    if (e instanceof FundBlocked) {
      return { ok: false, error: `"${e.fundName}" is a restricted fund and only has ₵${e.left.toLocaleString("en-GB")} left, which is less than this expense.`, fund: { name: e.fundName, left: e.left } };
    }
    if (isSerializationError(e)) return { ok: false, error: "Someone else is spending from that fund right now. Try again in a moment." };
    if (e instanceof LinkError) return { ok: false, error: e.message };
    throw e;
  }

  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "expense", entityId: id, detail: `Recorded GHS ${amount} expense: ${description}`, ...(data.source ? { meta: { source: data.source, sourceId: data.sourceId ?? null } } : {}) });
  safeRevalidate("/app/expenses", "/app/accounting", "/app/budgets");
  return { ok: true, id };
}

/** Throw from a `link` callback to cancel the whole save with a message for the person. */
export class LinkError extends Error {}

/** Edit an expense. A restricted fund is checked again when the amount or the fund changes. */
export async function updateExpenseCore(ctx: Ctx, id: string, input: ExpenseInput): Promise<PostResult> {
  const existing = await db.expense.findFirst({ where: { id, churchId: ctx.churchId }, select: { id: true, amount: true, fundId: true, description: true } });
  if (!existing) return { ok: false, error: "That expense was not found." };
  const description = String(input.description ?? "").trim().slice(0, 300);
  if (!description) return { ok: false, error: "Say what the money was for." };
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount above zero." };

  // Below Max the fund field is not shown, so keep whatever fund was on it.
  const links = await resolveLinks(ctx, { ...input, fundId: ctx.fundAccounting ? input.fundId : null });
  if (!links.ok) return links;
  const { r } = links;
  const fundId = ctx.fundAccounting ? r.fund?.id ?? null : existing.fundId;

  const data: Prisma.ExpenseUncheckedUpdateInput = {
    description,
    amount,
    category: String(input.category ?? "").trim().slice(0, 60) || "General",
    vendor: (input.vendor ?? "").trim() || r.vendorName,
    vendorId: r.vendorId,
    receiptRef: input.receiptRef?.trim() || null,
    paymentMethod: cleanMethod(input.paymentMethod),
    accountId: r.accountId,
    fundId,
    ...(ctx.budgetsOn ? { budgetId: r.budgetId, budgetItemId: r.budgetItemId } : {}),
    notes: input.notes?.trim() || null,
    ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl } : {}),
    ...(input.date && !Number.isNaN(input.date.getTime()) ? { date: input.date } : {}),
  };

  const recheck = !!r.fund?.restricted && (fundId !== existing.fundId || amount > existing.amount + 0.004);
  try {
    await inTx(recheck, async (tx) => {
      if (recheck && r.fund) {
        const balance = await fundBalance(tx, ctx.churchId, r.fund.id, id);
        if (amount > balance + 0.004) throw new FundBlocked(r.fund.name, Math.max(0, round2(balance)));
      }
      await tx.expense.updateMany({ where: { id, churchId: ctx.churchId }, data: data as Prisma.ExpenseUncheckedUpdateManyInput });
    });
  } catch (e) {
    if (e instanceof FundBlocked) return { ok: false, error: `"${e.fundName}" is a restricted fund and only has ₵${e.left.toLocaleString("en-GB")} left for this.`, fund: { name: e.fundName, left: e.left } };
    if (isSerializationError(e)) return { ok: false, error: "Someone else is spending from that fund right now. Try again in a moment." };
    throw e;
  }

  const changed = existing.amount !== amount ? ` (amount ${existing.amount} to ${amount})` : "";
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "expense", entityId: id, detail: `Edited expense: ${description}${changed}` });
  safeRevalidate("/app/expenses", "/app/accounting", "/app/budgets");
  return { ok: true, id };
}
