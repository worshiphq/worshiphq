import { Plus, Download, Wallet, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { accounts, budgets } from "@/lib/demo/data";
import { formatCurrency } from "@/config/brand";
import { formatDate } from "@/lib/utils";

export default function AccountingPage() {
  const income = accounts.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = accounts.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div>
      <PageHeader title="Accounting" description="Fund accounting, budgets and audit-ready reports — native in ₵.">
        <Button variant="secondary" size="sm"><Download /> Export report</Button>
        <Button size="sm"><Plus /> New transaction</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total income (MTD)" value={income} prefix="₵" change={12.1} icon={TrendingUp} />
        <StatCard label="Total expenses (MTD)" value={expenses} prefix="₵" change={-4.3} icon={TrendingDown} />
        <StatCard label="Net balance" value={income - expenses} prefix="₵" icon={Scale} />
        <StatCard label="Fund reserves" value={184200} prefix="₵" change={6.8} icon={Wallet} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* Transactions */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Recent transactions</h3>
            <Badge variant="default">Audit trail</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="p-4 font-medium">Description</th>
                  <th className="hidden p-4 font-medium sm:table-cell">Fund</th>
                  <th className="hidden p-4 font-medium md:table-cell">Date</th>
                  <th className="p-4 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((t) => (
                  <tr key={t.id} className="border-b border-line-soft last:border-0">
                    <td className="p-4">
                      <div className="font-medium">{t.description}</div>
                      <div className="text-xs text-ink-faint">{t.category}</div>
                    </td>
                    <td className="hidden p-4 text-ink-muted sm:table-cell">{t.fund}</td>
                    <td className="hidden p-4 text-ink-muted md:table-cell">{formatDate(t.date)}</td>
                    <td className={`p-4 text-right font-semibold ${t.amount > 0 ? "text-success" : "text-ink"}`}>
                      {t.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Budgets */}
        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Budget vs actual</h3>
            <p className="text-sm text-ink-muted">This month</p>
          </div>
          <div className="space-y-4 p-5">
            {budgets.map((b) => {
              const pct = Math.round((b.spent / b.budget) * 100);
              const over = pct > 100;
              return (
                <div key={b.category}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{b.category}</span>
                    <span className="text-ink-muted">{formatCurrency(b.spent)} / {formatCurrency(b.budget)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${over ? "bg-danger" : pct > 85 ? "bg-warning" : "bg-gradient-to-r from-primary to-primary-bright"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
