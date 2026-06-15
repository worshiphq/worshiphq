"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

export async function createTransaction(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  const rawAmount = Math.abs(Number(formData.get("amount") ?? 0));
  if (!rawAmount) return;
  const type = String(formData.get("type") ?? "Income");
  const amount = type === "Expense" ? -rawAmount : rawAmount;

  await db.transaction.create({
    data: {
      churchId: session.churchId,
      description,
      category: String(formData.get("category") ?? "General"),
      fund: String(formData.get("fund") ?? "General"),
      amount,
      date: new Date(),
    },
  });

  revalidatePath("/app/accounting");
}

/** Delete a transaction (admins only). */
export async function deleteTransaction(id: string) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.transaction.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/accounting");
}
