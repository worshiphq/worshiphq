"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createBudget(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const year = parseInt(String(formData.get("year") ?? new Date().getFullYear()));
  const quarterStr = String(formData.get("quarter") ?? "").trim();
  const quarter = quarterStr ? parseInt(quarterStr) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const budget = await db.budget.create({
    data: { churchId: session.churchId, name, year, quarter, notes },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "budget", entityId: budget.id, detail: `Created budget "${name}" for ${year}` });
  revalidatePath("/app/budgets");
}

export async function addBudgetItem(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const budgetId = String(formData.get("budgetId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!budgetId || !category || !description || !amount) return;

  await db.budgetItem.create({
    data: { churchId: session.churchId, budgetId, category, description, amount },
  });

  const items = await db.budgetItem.findMany({ where: { budgetId }, select: { amount: true } });
  const total = items.reduce((s, i) => s + i.amount, 0);
  await db.budget.update({ where: { id: budgetId }, data: { total } });

  revalidatePath("/app/budgets");
}

export async function deleteBudget(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const b = await db.budget.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  await db.budget.deleteMany({ where: { id, churchId: session.churchId } });
  if (b) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "budget", entityId: id, detail: `Deleted budget "${b.name}"` });
  revalidatePath("/app/budgets");
}

export async function deleteBudgetItem(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const item = await db.budgetItem.findFirst({ where: { id, churchId: session.churchId }, select: { budgetId: true } });
  await db.budgetItem.deleteMany({ where: { id, churchId: session.churchId } });

  if (item) {
    const items = await db.budgetItem.findMany({ where: { budgetId: item.budgetId }, select: { amount: true } });
    const total = items.reduce((s, i) => s + i.amount, 0);
    await db.budget.update({ where: { id: item.budgetId }, data: { total } });
  }

  revalidatePath("/app/budgets");
}
