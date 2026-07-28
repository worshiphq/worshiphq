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
  // The allocated amount — what this budget is funded with. Income/expense
  // entries are tracked live against it (allocated + income − spent = balance).
  const amount = Math.max(0, parseFloat(String(formData.get("amount") ?? "0")) || 0);

  // Guard the department belongs to this church.
  let deptId: string | null = null;
  if (departmentId) {
    const dept = await db.department.findFirst({ where: { id: departmentId, churchId: session.churchId }, select: { id: true } });
    deptId = dept?.id ?? null;
  }

  const budget = await db.budget.create({
    data: { churchId: session.churchId, name, year, quarter, notes, departmentId: deptId, total: amount },
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
  // Line items are a planned breakdown only — they never override the budget's
  // allocated amount (Budget.total), which the admin sets directly.

  revalidatePath("/app/budgets");
}

/** Change a budget's allocated amount after creation (admin only). */
export async function setBudgetAmount(formData: FormData) {
  const session = await requireModule("budgets");
  if (session.isDemo || isLeader(session)) return;

  const id = String(formData.get("id") ?? "").trim();
  const amount = Math.max(0, parseFloat(String(formData.get("amount") ?? "0")) || 0);
  if (!id) return;

  await db.budget.updateMany({ where: { id, churchId: session.churchId }, data: { total: amount } });
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

  // Post into the church's accounts so balances stay accurate: income adds,
  // expense subtracts, banked into the chosen account (or the default).
  const { postLedgerToAccount } = await import("@/lib/data/accounts");
  await postLedgerToAccount(session.churchId, {
    description: `Budget ${type} — ${description}`,
    category: category ?? "Budget",
    amount: type === "income" ? amount : -amount,
    fund: "Budget",
    accountId: String(formData.get("accountId") ?? "").trim() || null,
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "budget-entry", entityId: budgetId, detail: `${type === "income" ? "Income" : "Expense"} ${amount} — ${description}` });
  revalidatePath("/app/budgets");
  revalidatePath("/app/accounting");
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
  await db.budgetItem.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/budgets");
}
