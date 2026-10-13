import { Plus, Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { createTransaction } from "@/app/actions/accounting";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { AccountingClient } from "@/components/app/accounting/accounting-client";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getLedger, parseLedgerParams } from "@/lib/data/ledger";
import { ledgerQuery } from "@/lib/ledger-query";
import { db } from "@/lib/db";

export const metadata = { title: "Accounting" };

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireModule("accounting");
  const params = await searchParams;
  const { period, filters } = parseLedgerParams(params);

  const [ledger, accounts, funds, unTx, unGift, unExp] = await Promise.all([
    getLedger(session.churchId, period, filters),
    getAccountsWithBalances(session.churchId),
    db.fund.findMany({
      where: { churchId: session.churchId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, gifts: { select: { amount: true } } },
    }),
    db.transaction.aggregate({ where: { churchId: session.churchId, accountId: null }, _sum: { amount: true }, _count: true }),
    db.gift.aggregate({ where: { churchId: session.churchId, accountId: null }, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({ where: { churchId: session.churchId, accountId: null }, _sum: { amount: true }, _count: true }),
  ]);
  // All-time money with no account attached (folded into the default account).
  const unassigned = {
    count: unTx._count + unGift._count + unExp._count,
    net: Number(unTx._sum.amount ?? 0) + Number(unGift._sum.amount ?? 0) - Number(unExp._sum.amount ?? 0),
    defaultAccount: accounts.find((a) => a.isDefault)?.name ?? accounts[0]?.name ?? "the default account",
  };
  const fundRows = funds.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    giftCount: f.gifts.length,
    total: f.gifts.reduce((s, g) => s + Number(g.amount), 0),
  }));
  const accountOptions = [
    { label: "- No account -", value: "" },
    ...accounts.map((a) => ({ label: a.isDefault ? `${a.name} (default)` : a.name, value: a.id })),
  ];
  const exportQs = ledgerQuery(ledger.period, { ...ledger.filters, page: 1 }).toString();

  return (
    <div>
      <PageHeader title="Accounting" description="Every cedi in and out of your church: giving, expenses and other entries, across your bank, Mobile Money and cash accounts.">
        <a href={`/api/export/transactions?${exportQs}`}><Button variant="secondary" size="sm"><Download /> Export CSV</Button></a>
        <ActionDialog
          triggerLabel="New transaction"
          triggerIcon={<Plus />}
          title="Record transaction"
          description="Log income or an expense that isn't recorded in Giving or Expenses."
          submitLabel="Save transaction"
          action={createTransaction}
          disabled={session.isDemo}
        >
          <Field label="Description" name="description" placeholder="e.g. Hall rental, bank interest" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" name="type" options={["Income", "Expense"]} />
            <Field label="Amount (₵)" name="amount" type="number" step="0.01" placeholder="0.00" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            {accounts.length > 0 && <Field label="Account" name="accountId" type="select" options={accountOptions} hint="Which account the money moves through" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" name="category" placeholder="Rent / Operations" defaultValue="General" hint="The type of income or expense" />
            <Field label="Fund" name="fund" placeholder="General" defaultValue="General" hint="Which pot of money" />
          </div>
        </ActionDialog>
      </PageHeader>

      <AccountingClient
        ledger={ledger}
        accounts={accounts}
        funds={fundRows}
        unassigned={unassigned}
        canWrite={!session.isDemo}
        canDelete={session.canDelete && !session.isDemo}
      />
    </div>
  );
}
