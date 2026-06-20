import { Plus, Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { getAccounting } from "@/lib/data/modules";
import { createTransaction } from "@/app/actions/accounting";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { AccountingClient } from "@/components/app/accounting-client";

export const metadata = { title: "Accounting" };

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireModule("accounting");
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const rawMonth = params.month != null ? Number(params.month) : NaN;
  const month = rawMonth >= 0 && rawMonth <= 11 ? rawMonth : now.getMonth();

  const data = await getAccounting(session.churchId, year, month);

  return (
    <div>
      <PageHeader title="Accounting" description="Income, expenses, fund balances — weekly and monthly records in ₵.">
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
            <Field label="Category" name="category" placeholder="Offering / Operations" defaultValue="General" />
            <Field label="Fund" name="fund" placeholder="General" defaultValue="General" />
          </div>
        </ActionDialog>
      </PageHeader>

      <AccountingClient {...data} canWrite={!session.isDemo} />
    </div>
  );
}
