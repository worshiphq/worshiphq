"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createExpense(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;

  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!amount || amount <= 0) return;

  const category = String(formData.get("category") ?? "general");
  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const receiptRef = String(formData.get("receiptRef") ?? "").trim() || null;
  const approvedBy = String(formData.get("approvedBy") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();

  const expenseDate = dateStr ? new Date(dateStr) : new Date();

  const expense = await db.expense.create({
    data: {
      churchId: session.churchId,
      description,
      category,
      amount,
      vendor,
      receiptRef,
      approvedBy,
      date: expenseDate,
    },
  });

  await db.transaction.create({
    data: {
      churchId: session.churchId,
      description: `${description}${vendor ? ` (${vendor})` : ""}`,
      category,
      fund: "General",
      amount: -amount,
      date: expenseDate,
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "expense", entityId: expense.id, detail: `Recorded GHS ${amount} expense: ${description}` });
  revalidatePath("/app/expenses");
  revalidatePath("/app/accounting");
}

export async function deleteExpense(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const expense = await db.expense.findFirst({ where: { id, churchId: session.churchId }, select: { description: true, amount: true, vendor: true } });
  if (!expense) return;

  await db.expense.deleteMany({ where: { id, churchId: session.churchId } });

  const txDesc = `${expense.description}${expense.vendor ? ` (${expense.vendor})` : ""}`;
  await db.transaction.deleteMany({
    where: { churchId: session.churchId, description: txDesc, amount: -expense.amount },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "expense", entityId: id, detail: `Deleted GHS ${expense.amount} expense: ${expense.description}` });
  revalidatePath("/app/expenses");
  revalidatePath("/app/accounting");
}
