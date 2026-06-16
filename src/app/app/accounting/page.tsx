import { Plus, Download, Wallet, TrendingUp, TrendingDown, Scale, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/lib/auth";
import { getAccounting } from "@/lib/data/modules";
import { createTransaction, deleteTransaction } from "@/app/actions/accounting";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { formatCurrency } from "@/config/brand";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Accounting" };

export default async function AccountingPage() {
  const session = await requireModule("accounting");
  const { transactions, income, expenses, fundBalances } = await getAccounting(session.churchId);
  const canWrite = !session.isDemo;

  return (
    <div>
      <PageHeader title="Accounting" description="Fund accounting, balances and audit-ready records — native in ₵.">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total income" value={income} prefix="₵" icon={TrendingUp} />
        <StatCard label="Total expenses" value={expenses} prefix="₵" icon={TrendingDown} />
        <StatCard label="Net balance" value={income - expenses} prefix="₵" icon={Scale} />
        <StatCard label="Funds" value={fundBalances.length} icon={Wallet} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Recent transactions</h3>
            <Badge variant="default">Audit trail</Badge>
          </div>
          {transactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-muted">No transactions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <tr><th className="p-4 font-medium">Description</th><th className="hidden p-4 font-medium sm:table-cell">Fund</th><th className="hidden p-4 font-medium md:table-cell">Date</th><th className="p-4 text-right font-medium">Amount</th>{canWrite && <th className="p-4" />}</tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-line-soft last:border-0">
                      <td className="p-4"><div className="font-medium">{t.description}</div><div className="text-xs text-ink-faint">{t.category}</div></td>
                      <td className="hidden p-4 text-ink-muted sm:table-cell">{t.fund}</td>
                      <td className="hidden p-4 text-ink-muted md:table-cell">{formatDate(t.date)}</td>
                      <td className={`p-4 text-right font-semibold ${t.amount > 0 ? "text-success" : "text-ink"}`}>{t.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(t.amount))}</td>
                      {canWrite && (
                        <td className="p-4 text-right">
                          <form action={deleteTransaction.bind(null, t.id)}>
                            <SubmitButton variant="ghost" size="sm" overlay={false} successMessage="Transaction deleted" className="text-ink-faint hover:text-danger">
                              <Trash2 className="size-4" />
                            </SubmitButton>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Fund balances</h3><p className="text-sm text-ink-muted">Net by fund</p></div>
          <div className="divide-y divide-line-soft">
            {fundBalances.length === 0 ? (
              <div className="p-6 text-sm text-ink-faint">Balances appear as you record income and expenses.</div>
            ) : (
              fundBalances.map((f) => (
                <div key={f.fund} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm font-medium">{f.fund}</span>
                  <span className={`text-sm font-semibold ${f.balance >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(f.balance)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
