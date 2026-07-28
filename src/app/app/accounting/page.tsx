import { Plus, Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { getAccounting } from "@/lib/data/modules";
import { createTransaction } from "@/app/actions/accounting";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { AccountingClient } from "@/components/app/accounting-client";
import { AccountsManager } from "@/components/app/accounts-manager";
import { getAccountsWithBalances } from "@/lib/data/accounts";

export const metadata = { title: "Accounting" };

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireModule("accounting");
  const params = await searchParams;
  const now = new Date();
  const isAllTime = params.allTime === "1";
  const year = Number(params.year) || now.getFullYear();
  const rawMonth = params.month != null ? Number(params.month) : NaN;
  const month = rawMonth >= 0 && rawMonth <= 11 ? rawMonth : now.getMonth();

  const [data, accounts] = await Promise.all([
    getAccounting(session.churchId, year, month, isAllTime),
    getAccountsWithBalances(session.churchId),
  ]);
  const accountOptions = [
    { label: "— No account —", value: "" },
    ...accounts.map((a) => ({ label: a.isDefault ? `${a.name} (default)` : a.name, value: a.id })),
  ];

  return (
    <div>
      <PageHeader title="Accounting" description="Income, expenses, fund balances — weekly and monthly records in ₵. Categories classify the type (Offering, Tithe, Rent). Funds track which pot of money (General, Building, Missions).">
        <a href="/api/export/transactions"><Button variant="secondary" size="sm"><Download /> Export CSV</Button></a>
        <ActionDialog
          triggerLabel="New transaction"
          triggerIcon={<Plus />}
          title="Record transaction"
          description="Log income or an expense against a fund."
          submitLabel="Save transaction"
          action={createTransaction}
          disabled={session.isDemo}
        >
          <Field label="Description" name="description" placeholder="Sunday offering deposit" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" name="type" options={["Income", "Expense"]} />
            <Field label="Amount (₵)" name="amount" type="number" step="0.01" placeholder="0.00" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" name="category" placeholder="Offering / Operations" defaultValue="General" hint="What type of income or expense — e.g. Offering, Tithe, Utilities, Salaries" />
            <Field label="Fund" name="fund" placeholder="General" defaultValue="General" hint="Which pot of money — e.g. General, Building, Missions, Youth" />
          </div>
          {accounts.length > 0 && (
            <Field label="Account" name="accountId" type="select" options={accountOptions} hint="Which account the money moves through" />
          )}
        </ActionDialog>
      </PageHeader>

      <AccountsManager accounts={accounts} canWrite={!session.isDemo} />

      <AccountingClient
        {...data}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, isDefault: a.isDefault }))}
        canWrite={!session.isDemo}
      />
    </div>
  );
}
