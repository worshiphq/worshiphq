import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ExpensesClient } from "@/components/app/expenses-client";
import { createExpense } from "@/app/actions/expenses";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { getLedger, parseLedgerParams, periodBounds } from "@/lib/data/ledger";
import { ledgerQuery } from "@/lib/ledger-query";

export const metadata = { title: "Expenses" };

const CATEGORIES = ["General", "Utilities", "Rent", "Transport", "Maintenance", "Supplies", "Salaries", "Missions", "Welfare", "Events", "Instruments", "Honorarium"];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireModule("expenses");
  const params = await searchParams;
  const parsed = parseLedgerParams(params);
  // This page is only ever the expense records, whatever is in the address bar.
  const filters = { ...parsed.filters, source: "expense" as const, type: "" as const, fund: "", group: false };

  const [ledger, accounts, allUsed] = await Promise.all([
    getLedger(session.churchId, parsed.period, filters),
    db.churchAccount.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isDefault: true },
    }),
    db.expense.findMany({ where: { churchId: session.churchId }, select: { category: true }, distinct: ["category"], take: 200 }),
  ]);
  ledger.activeFilters = [filters.account, filters.category, filters.q].filter(Boolean).length;

  // Details the ledger doesn't carry (payee, receipt, approver) for the rows on this page.
  const ids = ledger.rows.map((r) => r.id);
  const { from, to } = periodBounds(parsed.period);
  const [details, payees] = await Promise.all([
    ids.length ? db.expense.findMany({ where: { churchId: session.churchId, id: { in: ids } }, select: { id: true, description: true, vendor: true, receiptRef: true, approvedBy: true } }) : Promise.resolve([]),
    db.expense.groupBy({
      by: ["vendor"],
      where: {
        churchId: session.churchId, vendor: { not: null },
        ...(from && to ? { date: { gte: from, lte: to } } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.account && filters.account !== "none" ? { accountId: filters.account } : {}),
      },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
      take: 8,
    }),
  ]);

  const accountOptions = [
    { label: "- No account -", value: "" },
    ...accounts.map((a) => ({ label: a.isDefault ? `${a.name} (default)` : a.name, value: a.id })),
  ];
  const categorySuggestions = [...new Set([...CATEGORIES, ...allUsed.map((e) => e.category).filter(Boolean)])];
  const exportQs = ledgerQuery(ledger.period, { ...filters, page: 1 }).toString();

  return (
    <div>
      <PageHeader title="Expenses" description="Everything the church spent, by month and week, with reports.">
        <a href={`/api/export/transactions?${exportQs}`}><Button variant="secondary" size="sm"><Download /> Export</Button></a>
        <ActionDialog
          triggerLabel="Record expense"
          triggerIcon={<Plus />}
          title="Record expense"
          description="Log a church expense or payment."
          submitLabel="Record"
          action={createExpense}
          disabled={!canEdit(session, "expenses")}
        >
          <Field label="Description" name="description" placeholder="What was purchased or paid for" required />
          <Field label="Amount (GHS)" name="amount" type="number" placeholder="0" required />
          {accounts.length > 0 && (
            <Field label="Deduct from account" name="accountId" type="select" options={accountOptions} hint="Which account this payment comes out of" />
          )}
          <Field label="Category" name="category" suggestions={categorySuggestions} placeholder="Pick one or type your own (e.g. Instruments)" hint="Type any category - it’s remembered for next time." />
          <Field label="Vendor / payee" name="vendor" placeholder="Who was paid" />
          <Field label="Receipt reference" name="receiptRef" placeholder="Receipt or invoice number" />
          <Field label="Approved by" name="approvedBy" placeholder="Name of approving officer" />
          <Field label="Date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </ActionDialog>
      </PageHeader>

      <ExpensesClient
        ledger={ledger}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, isDefault: a.isDefault }))}
        details={Object.fromEntries(details.map((d) => [d.id, { description: d.description, vendor: d.vendor, receiptRef: d.receiptRef, approvedBy: d.approvedBy }]))}
        payees={payees.map((p) => ({ name: p.vendor ?? "", total: Number(p._sum.amount ?? 0), count: p._count }))}
        canWrite={canEdit(session, "expenses")}
        canDelete={session.canDelete && canEdit(session, "expenses")}
      />
    </div>
  );
}
