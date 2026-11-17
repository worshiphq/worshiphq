import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ExpensesClient } from "@/components/app/expenses-client";
import { getLedger, parseLedgerParams, periodBounds } from "@/lib/data/ledger";
import { ledgerQuery } from "@/lib/ledger-query";
import { ctxFrom } from "@/lib/expenses/post";
import { fundBalances, pendingRequests, recurringList, vendorList, missingReceiptsCount, budgetUsage, queryExpenseRequests } from "@/lib/data/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/assets/categories";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireModule("expenses");
  const params = await searchParams;
  const parsed = parseLedgerParams(params);
  // This page is only ever the expense records, whatever is in the address bar.
  const filters = { ...parsed.filters, source: "expense" as const, type: "" as const, fund: "", group: false };
  const ctx = ctxFrom(session);
  const canWrite = canEdit(session, "expenses");
  const { from, to } = periodBounds(parsed.period);
  const now = new Date();

  const mineOnly = !canWrite;
  const [ledger, accounts, allUsed, funds, pending, recurring, vendors, missing, budgets, church, payees, usedRecent, decided, byMethod] = await Promise.all([
    getLedger(session.churchId, parsed.period, filters),
    db.churchAccount.findMany({ where: { churchId: session.churchId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }),
    db.expense.findMany({ where: { churchId: session.churchId }, select: { category: true }, distinct: ["category"], take: 200 }),
    // Bug fix: balances by groupBy instead of loading every gift and expense of every fund.
    ctx.fundAccounting ? fundBalances(session.churchId) : Promise.resolve([]),
    pendingRequests(session.churchId),
    recurringList(session.churchId),
    vendorList(session.churchId),
    missingReceiptsCount(session.churchId, from, to),
    ctx.budgetsOn ? budgetUsage(session.churchId, now.getUTCFullYear()) : Promise.resolve([]),
    db.church.findUnique({ where: { id: session.churchId }, select: { expenseApprovalOver: true } }),
    db.expense.groupBy({
      by: ["vendor"],
      where: { churchId: session.churchId, vendor: { not: null }, ...(from && to ? { date: { gte: from, lte: to } } : {}) },
      _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } }, take: 8,
    }),
    db.expense.groupBy({ by: ["category"], where: { churchId: session.churchId, date: { gte: new Date(now.getTime() - 180 * 86400000) } }, _count: true, orderBy: { _count: { category: "desc" } }, take: 6 }),
    queryExpenseRequests(session.churchId, "", { requestedBy: mineOnly ? session.userId : undefined }, 1),
    db.expense.groupBy({ by: ["paymentMethod"], where: { churchId: session.churchId, ...(from && to ? { date: { gte: from, lte: to } } : {}) }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } }),
  ]);

  // Details for the rows on this page (the drawer and the table).
  const ids = ledger.rows.map((r) => r.id);
  const details = ids.length
    ? await db.expense.findMany({
        where: { churchId: session.churchId, id: { in: ids } },
        select: {
          id: true, description: true, vendor: true, receiptRef: true, receiptUrl: true, approvedBy: true, paymentMethod: true, notes: true, accountId: true, fundId: true,
          budgetId: true, budgetItemId: true, vendorId: true, source: true, sourceId: true, createdByName: true, createdAt: true, date: true, amount: true, category: true,
          budget: { select: { name: true } }, budgetItem: { select: { description: true } }, asset: { select: { id: true, name: true, vehicle: { select: { id: true, regNumber: true } } } },
        },
      })
    : [];

  const exportQs = ledgerQuery(ledger.period, { ...filters, page: 1 }).toString();
  const categories = [...new Set([...usedRecent.map((u) => u.category), ...EXPENSE_CATEGORIES, ...allUsed.map((e) => e.category).filter(Boolean)])];

  return (
    <ExpensesClient
      ledger={ledger}
      accounts={accounts}
      funds={funds}
      details={Object.fromEntries(details.map((d) => [d.id, {
        id: d.id, description: d.description, vendor: d.vendor, receiptRef: d.receiptRef, receiptUrl: d.receiptUrl, approvedBy: d.approvedBy, paymentMethod: d.paymentMethod,
        notes: d.notes, accountId: d.accountId, fundId: d.fundId, budgetId: d.budgetId, budgetItemId: d.budgetItemId, vendorId: d.vendorId, source: d.source,
        createdByName: d.createdByName, createdAt: d.createdAt.toISOString(), date: d.date.toISOString(), amount: d.amount, category: d.category,
        budgetName: d.budget?.name ?? null, budgetItemName: d.budgetItem?.description ?? null,
        assetLink: d.asset ? (d.asset.vehicle ? { href: `/app/vehicles/${d.asset.vehicle.id}`, label: d.asset.vehicle.regNumber } : { href: `/app/assets/${d.asset.id}`, label: d.asset.name }) : null,
      }]))}
      payees={payees.map((p) => ({ name: p.vendor ?? "", total: Number(p._sum.amount ?? 0), count: p._count }))}
      pending={mineOnly ? pending.filter((r) => r.requestedById === session.userId) : pending}
      decided={decided}
      byMethod={byMethod.map((m) => ({ method: m.paymentMethod, total: Number(m._sum.amount ?? 0), count: m._count }))}
      recurring={recurring.map((r) => ({ id: r.id, description: r.description, amount: r.amount, category: r.category, vendorName: r.vendorName, vendorId: r.vendorId, accountId: r.accountId, paymentMethod: r.paymentMethod, frequency: r.frequency, nextDue: r.nextDue.toISOString(), endsAt: r.endsAt?.toISOString() ?? null, active: r.active, budgetItemId: r.budgetItemId, fundId: r.fundId }))}
      vendors={vendors}
      missingReceipts={missing}
      budgets={budgets}
      categories={categories}
      topCategories={usedRecent.map((u) => u.category)}
      approvalOver={church?.expenseApprovalOver ?? null}
      exportQs={exportQs}
      me={{ id: session.userId, isOwner: session.role === "Owner", isAdmin: session.role === "Owner" || session.role === "Admin" }}
      canWrite={canWrite}
      canDelete={canWrite && session.canDelete}
      fundAccounting={ctx.fundAccounting}
      budgetsOn={ctx.budgetsOn}
    />
  );
}
