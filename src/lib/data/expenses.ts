import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Fund balances (given minus spent) with two groupBy queries instead of loading every gift and expense. */
export async function fundBalances(churchId: string) {
  const [funds, given, spent] = await Promise.all([
    db.fund.findMany({ where: { churchId }, orderBy: { name: "asc" }, select: { id: true, name: true, restricted: true } }),
    db.gift.groupBy({ by: ["fundId"], where: { churchId, fundId: { not: null } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["fundId"], where: { churchId, fundId: { not: null } }, _sum: { amount: true } }),
  ]);
  const g = new Map(given.map((x) => [x.fundId, Number(x._sum.amount ?? 0)]));
  const s = new Map(spent.map((x) => [x.fundId, Number(x._sum.amount ?? 0)]));
  return funds.map((f) => ({ ...f, left: Math.round(((g.get(f.id) ?? 0) - (s.get(f.id) ?? 0)) * 100) / 100 }));
}

export type ExpenseRequestFilters = { status?: string; requestedBy?: string };
export const REQUEST_PAGE = 20;

export type ExpenseRequestRow = {
  id: string; description: string; amount: number; category: string; vendorName: string | null; neededBy: string | null; attachmentUrl: string | null;
  note: string | null; status: string; requestedById: string | null; requestedByName: string | null; decidedByName: string | null; decidedAt: string | null;
  decisionNote: string | null; createdAt: string; source: string | null; expenseId: string | null;
  budget: { id: string; name: string } | null; budgetItem: { id: string; description: string; amount: number } | null; accountId: string | null;
};

const REQ_INCLUDE = { budget: { select: { id: true, name: true } }, budgetItem: { select: { id: true, description: true, amount: true } } } satisfies Prisma.ExpenseRequestInclude;

const toReqRow = (r: Prisma.ExpenseRequestGetPayload<{ include: typeof REQ_INCLUDE }>): ExpenseRequestRow => ({
  id: r.id, description: r.description, amount: r.amount, category: r.category, vendorName: r.vendorName, neededBy: r.neededBy?.toISOString() ?? null,
  attachmentUrl: r.attachmentUrl, note: r.note, status: r.status, requestedById: r.requestedById, requestedByName: r.requestedByName,
  decidedByName: r.decidedByName, decidedAt: r.decidedAt?.toISOString() ?? null, decisionNote: r.decisionNote, createdAt: r.createdAt.toISOString(),
  source: r.source, expenseId: r.expenseId, budget: r.budget, budgetItem: r.budgetItem, accountId: r.accountId,
});

export async function queryExpenseRequests(churchId: string, search: string, f: ExpenseRequestFilters, pageWanted: number) {
  const q = search.trim().slice(0, 60);
  const where: Prisma.ExpenseRequestWhereInput = {
    churchId,
    ...(f.status === "open" ? { status: { in: ["pending", "approved"] } } : f.status ? { status: f.status } : { status: { notIn: ["pending", "approved"] } }),
    ...(f.requestedBy ? { requestedById: f.requestedBy } : {}),
    ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { vendorName: { contains: q, mode: "insensitive" } }, { requestedByName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const total = await db.expenseRequest.count({ where });
  const page = Math.min(Math.max(1, pageWanted || 1), Math.max(1, Math.ceil(total / REQUEST_PAGE)));
  const rows = await db.expenseRequest.findMany({ where, include: REQ_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * REQUEST_PAGE, take: REQUEST_PAGE });
  return { rows: rows.map(toReqRow), total, page };
}

/** Requests waiting for a decision or for payment. */
export async function pendingRequests(churchId: string, requestedBy?: string) {
  const rows = await db.expenseRequest.findMany({
    where: { churchId, status: { in: ["pending", "approved"] }, ...(requestedBy ? { requestedById: requestedBy } : {}) },
    include: REQ_INCLUDE,
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return rows.map(toReqRow);
}

/** Recurring expenses that are due on or before `until`. */
export async function recurringDue(churchId: string, until: Date) {
  return db.recurringExpense.findMany({ where: { churchId, active: true, nextDue: { lte: until } }, orderBy: { nextDue: "asc" }, take: 20 });
}

export async function recurringList(churchId: string) {
  return db.recurringExpense.findMany({ where: { churchId }, orderBy: [{ active: "desc" }, { nextDue: "asc" }], take: 200 });
}

export async function vendorList(churchId: string) {
  return db.vendor.findMany({ where: { churchId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, momoNumber: true, category: true }, take: 500 });
}

/** Expenses in a period with no receipt photo and no receipt number. */
export async function missingReceiptsCount(churchId: string, from: Date | null, to: Date | null) {
  return db.expense.count({ where: { churchId, receiptUrl: null, receiptRef: null, ...(from && to ? { date: { gte: from, lte: to } } : {}) } });
}

/**
 * What each budget has used: BudgetEntry spending plus every Expense linked to it. Linked expenses never create a
 * BudgetEntry, so adding the two never counts the same money twice. Per-line use is the linked expenses on that line.
 */
export async function budgetUsage(churchId: string, year: number, departmentId?: string | null) {
  const budgets = await db.budget.findMany({
    where: { churchId, year, ...(departmentId ? { departmentId } : {}), status: { not: "closed" } },
    select: { id: true, name: true, total: true, items: { select: { id: true, description: true, category: true, amount: true } } },
    orderBy: { name: "asc" },
  });
  if (!budgets.length) return [];
  const ids = budgets.map((b) => b.id);
  const [entries, linked, byItem] = await Promise.all([
    db.budgetEntry.groupBy({ by: ["budgetId"], where: { churchId, budgetId: { in: ids }, type: "expense" }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["budgetId"], where: { churchId, budgetId: { in: ids } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["budgetItemId"], where: { churchId, budgetId: { in: ids }, budgetItemId: { not: null } }, _sum: { amount: true } }),
  ]);
  const e = new Map(entries.map((x) => [x.budgetId, Number(x._sum.amount ?? 0)]));
  const l = new Map(linked.map((x) => [x.budgetId, Number(x._sum.amount ?? 0)]));
  const it = new Map(byItem.map((x) => [x.budgetItemId, Number(x._sum.amount ?? 0)]));
  return budgets.map((b) => {
    const allocated = b.total || b.items.reduce((t, i) => t + i.amount, 0);
    const used = (e.get(b.id) ?? 0) + (l.get(b.id) ?? 0);
    return {
      id: b.id, name: b.name, allocated, used: Math.round(used * 100) / 100,
      items: b.items.map((i) => ({ id: i.id, description: i.description, category: i.category, amount: i.amount, used: Math.round((it.get(i.id) ?? 0) * 100) / 100 })),
    };
  });
}
