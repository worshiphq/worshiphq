"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { RecycleBin } from "@/lib/recycle-bin";
import { redirect } from "next/navigation";

export async function createExpense(formData: FormData) {
  const session = await requireManage("expenses");
  if (session.isDemo) return;

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;

  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!amount || amount <= 0) return;

  // Free-text category (with suggestions in the UI) - any value is allowed.
  const category = String(formData.get("category") ?? "").trim() || "General";
  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const receiptRef = String(formData.get("receiptRef") ?? "").trim() || null;
  const approvedBy = String(formData.get("approvedBy") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();
  // Guard the account belongs to this church before deducting from it.
  const accountIdRaw = String(formData.get("accountId") ?? "").trim();
  let accountId: string | null = null;
  if (accountIdRaw) {
    const acc = await db.churchAccount.findFirst({ where: { id: accountIdRaw, churchId: session.churchId }, select: { id: true } });
    accountId = acc?.id ?? null;
  }

  const expenseDate = dateStr ? new Date(dateStr) : new Date();

  // Fund accounting (Max): an expense can be charged to a fund. A RESTRICTED fund can only be spent from
  // what has been given to it, so the amount is checked against its balance. Below Max the fund is ignored
  // altogether (and so is the restriction), because the whole of fund accounting goes with the plan.
  const fundAccountingOn = !session.planLocked?.includes("fund-accounting");
  let fund: { id: string; name: string; restricted: boolean } | null = null;
  const fundIdRaw = String(formData.get("fundId") ?? "").trim();
  if (fundAccountingOn && fundIdRaw) {
    fund = await db.fund.findFirst({ where: { id: fundIdRaw, churchId: session.churchId }, select: { id: true, name: true, restricted: true } });
  }

  const data = {
    churchId: session.churchId,
    description,
    category,
    amount,
    vendor,
    receiptRef,
    approvedBy,
    ...(accountId ? { accountId } : {}),
    ...(fund ? { fundId: fund.id } : {}),
    date: expenseDate,
  };

  let expense;
  if (fund?.restricted) {
    // Check and write in ONE serializable transaction, so two people spending from the same fund at the
    // same moment cannot both be told there is enough left.
    const fundId = fund.id;
    const result = await db.$transaction(async (tx) => {
      const [given, spent] = await Promise.all([
        tx.gift.aggregate({ where: { churchId: session.churchId, fundId }, _sum: { amount: true } }),
        tx.expense.aggregate({ where: { churchId: session.churchId, fundId }, _sum: { amount: true } }),
      ]);
      const balance = Number(given._sum.amount ?? 0) - Number(spent._sum.amount ?? 0);
      if (amount > balance + 0.004) return { blocked: true as const, balance };
      return { blocked: false as const, row: await tx.expense.create({ data }) };
    }, { isolationLevel: "Serializable" });
    if (result.blocked) {
      redirect(`/app/expenses?error=fund&fund=${encodeURIComponent(fund.name)}&left=${Math.max(0, Math.round(result.balance * 100) / 100)}`);
    }
    expense = result.row;
  } else {
    expense = await db.expense.create({ data });
  }

  // NOTE: no mirror Transaction - the Expense row is the single source of truth.
  // Account balances subtract expenses (getAccountOptions) and the accounting
  // ledger surfaces them (getAccounting). A mirror here double-counted expenses.

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "expense", entityId: expense.id, detail: `Recorded GHS ${amount} expense: ${description}` });
  revalidatePath("/app/expenses");
  revalidatePath("/app/accounting");
}

export async function deleteExpense(formData: FormData) {
  const session = await requireManage("expenses");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const expense = await db.expense.findFirst({ where: { id, churchId: session.churchId }, select: { description: true, amount: true, vendor: true } });
  if (!expense) return;

  await RecycleBin.captureExpense(session, id);
  await db.expense.deleteMany({ where: { id, churchId: session.churchId } });

  // Clean up any legacy mirror Transaction from before expenses were single-sourced.
  const txDesc = `${expense.description}${expense.vendor ? ` (${expense.vendor})` : ""}`;
  await db.transaction.deleteMany({
    where: { churchId: session.churchId, description: txDesc, amount: -expense.amount, accountId: null, fund: "General" },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "expense", entityId: id, detail: `Deleted GHS ${expense.amount} expense: ${expense.description}` });
  revalidatePath("/app/expenses");
  revalidatePath("/app/accounting");
}
