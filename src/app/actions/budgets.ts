"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/** Budget leaders are scoped to their own department and can't create/delete budgets. */
function isLeader(session: { budgetDepartmentId?: string | null }) {
  return !!session.budgetDepartmentId;
}

export async function createBudget(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo || isLeader(session)) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const year = parseInt(String(formData.get("year") ?? new Date().getFullYear()));
  const quarterStr = String(formData.get("quarter") ?? "").trim();
  const quarter = quarterStr ? parseInt(quarterStr) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;

  // Guard the department belongs to this church.
  let deptId: string | null = null;
  if (departmentId) {
    const dept = await db.department.findFirst({ where: { id: departmentId, churchId: session.churchId }, select: { id: true } });
    deptId = dept?.id ?? null;
  }

  const budget = await db.budget.create({
    data: { churchId: session.churchId, name, year, quarter, notes, departmentId: deptId },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "budget", entityId: budget.id, detail: `Created budget "${name}" for ${year}` });
  revalidatePath("/app/budgets");
}

export async function addBudgetItem(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo || isLeader(session)) return;

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

/** Log actual income or expense against a budget. Available to admins AND the
 *  department's budget leaders (scoped to their own department's budgets). */
export async function addBudgetEntry(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo) return { ok: false, error: "Read-only demo." };

  const budgetId = String(formData.get("budgetId") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  const dateStr = String(formData.get("date") ?? "").trim();

  if (!budgetId || !description || !amount || amount <= 0) return { ok: false, error: "Fill in a description and amount." };
  if (type !== "income" && type !== "expense") return { ok: false, error: "Choose income or expense." };

  const budget = await db.budget.findFirst({
    where: { id: budgetId, churchId: session.churchId },
    select: { id: true, departmentId: true },
  });
  if (!budget) return { ok: false, error: "Budget not found." };
  // A scoped leader may only write to their own department's budgets.
  if (isLeader(session) && budget.departmentId !== session.budgetDepartmentId) {
    return { ok: false, error: "You can only record against your department's budget." };
  }

  await db.budgetEntry.create({
    data: {
      churchId: session.churchId,
      budgetId,
      type,
      description,
      category,
      amount,
      date: dateStr ? new Date(dateStr) : new Date(),
      createdById: session.userId,
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "budget-entry", entityId: budgetId, detail: `${type === "income" ? "Income" : "Expense"} ${amount} — ${description}` });
  revalidatePath("/app/budgets");
  return { ok: true };
}

export async function deleteBudgetEntry(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const entry = await db.budgetEntry.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true, budget: { select: { departmentId: true } } },
  });
  if (!entry) return;
  if (isLeader(session) && entry.budget.departmentId !== session.budgetDepartmentId) return;

  await db.budgetEntry.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/budgets");
}

export async function deleteBudget(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo || isLeader(session)) return;

  const id = String(formData.get("id"));
  const b = await db.budget.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  await db.budget.deleteMany({ where: { id, churchId: session.churchId } });
  if (b) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "budget", entityId: id, detail: `Deleted budget "${b.name}"` });
  revalidatePath("/app/budgets");
}

export async function deleteBudgetItem(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo || isLeader(session)) return;

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
