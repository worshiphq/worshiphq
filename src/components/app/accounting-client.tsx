"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown, ChevronRight, Download, Calendar,
  TrendingUp, TrendingDown, Scale, Wallet,
  HandCoins, Banknote, Trash2, Pencil, Check, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/app/stat-card";
import { useFeedback } from "@/components/ui/feedback";
import { deleteTransaction, editTransaction } from "@/app/actions/accounting";
import { formatCurrency } from "@/config/brand";
import { formatDate, cn } from "@/lib/utils";
import type { AccountingWeek, AccountingRow } from "@/lib/data/modules";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Props {
  transactions: AccountingRow[];
  income: number;
  expenses: number;
  fundBalances: { fund: string; balance: number }[];
  weeks: AccountingWeek[];
  monthLabel: string;
  year: number;
  month: number;
  canWrite: boolean;
}

export function AccountingClient({ transactions, income, expenses, fundBalances, weeks, monthLabel, year, month, canWrite }: Props) {
  const [tab, setTab] = useState<"weekly" | "all" | "report">("weekly");
  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);
  const needsRefresh = selectedYear !== year || selectedMonth !== month;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Calendar className="size-4 text-ink-faint" />
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="bg-transparent text-sm font-medium outline-none">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-transparent text-sm font-medium outline-none">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {needsRefresh && (
          <a href={`/app/accounting?year=${selectedYear}&month=${selectedMonth}`}>
            <Button size="sm" variant="secondary">Load {MONTHS[selectedMonth]} {selectedYear}</Button>
          </a>
        )}
        <span className="text-sm text-ink-muted">{monthLabel}</span>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total income" value={income} prefix="₵" icon={TrendingUp} />
        <StatCard label="Total expenses" value={expenses} prefix="₵" icon={TrendingDown} />
        <StatCard label="Net balance" value={income - expenses} prefix="₵" icon={Scale} />
        <StatCard label="Funds" value={fundBalances.length} icon={Wallet} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {[
          { id: "weekly" as const, label: "Weekly view", icon: Calendar },
          { id: "all" as const, label: "All transactions", icon: Banknote },
          { id: "report" as const, label: "Monthly report", icon: Download },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "weekly" && <WeeklyView weeks={weeks} canWrite={canWrite} />}
      {tab === "all" && <AllTransactions rows={transactions} canWrite={canWrite} />}
      {tab === "report" && <MonthlyReport weeks={weeks} income={income} expenses={expenses} fundBalances={fundBalances} monthLabel={monthLabel} year={year} month={month} />}
    </div>
  );
}

/* ────── Weekly View ────── */

function WeeklyView({ weeks, canWrite }: { weeks: AccountingWeek[]; canWrite: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(weeks.filter((w) => w.transactions.length > 0 || w.givingIncome.length > 0).map((w) => w.label)));

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const net = week.income - week.expenses;
        const hasData = week.transactions.length > 0 || week.givingIncome.length > 0;
        return (
          <Card key={week.label} className="overflow-hidden">
            <button onClick={() => toggle(week.label)} className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-2/50">
              <div className="flex items-center gap-3">
                {expanded.has(week.label) ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
                <div>
                  <span className="font-display text-sm font-semibold">{week.label}</span>
                  <span className="ml-2 text-xs text-ink-faint">{formatDate(week.startDate)} — {formatDate(week.endDate)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-xs">
                  <span className="text-success">+{formatCurrency(week.income)}</span>
                  {week.expenses > 0 && <span className="ml-2 text-ink">−{formatCurrency(week.expenses)}</span>}
                </div>
                <span className={cn("font-display text-lg font-bold", net >= 0 ? "text-success" : "text-danger")}>
                  {net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(net))}
                </span>
              </div>
            </button>

            {expanded.has(week.label) && hasData && (
              <div className="border-t border-line">
                {week.givingIncome.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 border-b border-line-soft bg-success/5 px-5 py-2">
                      <HandCoins className="size-3.5 text-success" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-success">Giving income</span>
                      <span className="ml-auto text-xs font-medium text-success">+{formatCurrency(week.givingIncome.reduce((s, r) => s + r.amount, 0))}</span>
                    </div>
                    <div className="divide-y divide-line-soft">
                      {week.givingIncome.map((r) => <TransactionRow key={r.id} row={r} canWrite={false} />)}
                    </div>
                  </div>
                )}
                {week.transactions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 border-b border-line-soft bg-surface-2/50 px-5 py-2">
                      <Banknote className="size-3.5 text-ink-faint" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Manual entries</span>
                    </div>
                    <div className="divide-y divide-line-soft">
                      {week.transactions.map((r) => <TransactionRow key={r.id} row={r} canWrite={canWrite} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {expanded.has(week.label) && !hasData && (
              <div className="border-t border-line px-5 py-6 text-center text-sm text-ink-faint">No transactions this week</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TransactionRow({ row, canWrite }: { row: AccountingRow; canWrite: boolean }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editDesc, setEditDesc] = useState(row.description);
  const [editAmount, setEditAmount] = useState(String(Math.abs(row.amount)));
  const [editCategory, setEditCategory] = useState(row.category);
  const [editFund, setEditFund] = useState(row.fund);
  const [pending, startTransition] = useTransition();
  const { toast } = useFeedback();

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("description", editDesc);
      fd.set("amount", row.amount >= 0 ? editAmount : String(-Math.abs(Number(editAmount))));
      fd.set("category", editCategory);
      fd.set("fund", editFund);
      const res = await editTransaction(row.id, fd);
      if (!res?.ok) toast(res?.error ?? "Failed to update", "error");
      else { toast("Transaction updated", "success"); setMode("view"); }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteTransaction(row.id);
      toast("Transaction deleted", "success");
      setMode("view");
    });
  };

  if (mode === "edit") {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-primary/5 px-5 py-3">
        <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary/50" />
        <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Category"
          className="w-24 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary/50" />
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-faint">GHS</span>
          <input type="number" min="0.01" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
            className="w-28 rounded-lg border border-line bg-surface py-1.5 pl-10 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50" />
        </div>
        <button onClick={handleSave} disabled={pending}
          className="grid size-7 place-items-center rounded-lg text-success hover:bg-success/10">
          {pending ? <div className="size-3.5 animate-spin rounded-full border-2 border-success border-t-transparent" /> : <Check className="size-3.5" />}
        </button>
        <button onClick={() => setMode("view")}
          className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{row.description}</div>
        <div className="text-xs text-ink-faint">{row.category} · {formatDate(row.date)}</div>
      </div>
      <div className="flex items-center gap-2">
        {row.source === "giving" && <Badge variant="success" className="text-[10px]">Giving</Badge>}
        <span className={cn("font-display text-sm font-semibold", row.amount >= 0 ? "text-success" : "text-ink")}>
          {row.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(row.amount))}
        </span>
        {canWrite && row.source === "manual" && mode !== "delete" && (
          <div className="flex items-center gap-1">
            <button onClick={() => setMode("edit")} title="Edit transaction"
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
              <Pencil className="size-3.5" />
            </button>
            <button onClick={() => setMode("delete")} title="Delete transaction"
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
        {canWrite && mode === "delete" && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-danger">Delete?</span>
            <button onClick={handleDelete} disabled={pending}
              className="grid size-7 place-items-center rounded-lg text-danger hover:bg-danger/10">
              {pending ? <div className="size-3.5 animate-spin rounded-full border-2 border-danger border-t-transparent" /> : <Check className="size-3.5" />}
            </button>
            <button onClick={() => setMode("view")}
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────── All Transactions ────── */

function AllTransactions({ rows, canWrite }: { rows: AccountingRow[]; canWrite: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5">
        <h3 className="font-display text-lg font-semibold">All transactions</h3>
        <Badge variant="default">Audit trail</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-muted">No transactions this month.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-4 font-medium">Description</th>
                <th className="hidden p-4 font-medium sm:table-cell">Category</th>
                <th className="hidden p-4 font-medium md:table-cell">Fund</th>
                <th className="hidden p-4 font-medium lg:table-cell">Date</th>
                <th className="p-4 font-medium">Source</th>
                <th className="p-4 text-right font-medium">Amount</th>
                {canWrite && <th className="p-4 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <AllTransactionsRow key={r.id} row={r} canWrite={canWrite} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AllTransactionsRow({ row: r, canWrite }: { row: AccountingRow; canWrite: boolean }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editDesc, setEditDesc] = useState(r.description);
  const [editAmount, setEditAmount] = useState(String(Math.abs(r.amount)));
  const [editCategory, setEditCategory] = useState(r.category);
  const [editFund, setEditFund] = useState(r.fund);
  const [pending, startTransition] = useTransition();
  const { toast } = useFeedback();

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("description", editDesc);
      fd.set("amount", r.amount >= 0 ? editAmount : String(-Math.abs(Number(editAmount))));
      fd.set("category", editCategory);
      fd.set("fund", editFund);
      const res = await editTransaction(r.id, fd);
      if (!res?.ok) toast(res?.error ?? "Failed to update", "error");
      else { toast("Transaction updated", "success"); setMode("view"); }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteTransaction(r.id);
      toast("Transaction deleted", "success");
      setMode("view");
    });
  };

  if (mode === "edit") {
    return (
      <tr className="border-b border-line-soft bg-primary/5 last:border-0">
        <td className="p-4">
          <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description"
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary/50" />
        </td>
        <td className="hidden p-4 sm:table-cell">
          <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Category"
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary/50" />
        </td>
        <td className="hidden p-4 md:table-cell">
          <input value={editFund} onChange={(e) => setEditFund(e.target.value)} placeholder="Fund"
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary/50" />
        </td>
        <td className="hidden p-4 text-ink-muted lg:table-cell">{formatDate(r.date)}</td>
        <td className="p-4"><Badge variant="outline" className="text-[10px]">Manual</Badge></td>
        <td className="p-4">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-faint">GHS</span>
            <input type="number" min="0.01" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
              className="w-28 rounded-lg border border-line bg-surface py-1.5 pl-10 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50" />
          </div>
        </td>
        {canWrite && (
          <td className="p-4 text-right">
            <div className="flex items-center justify-end gap-1">
              <button onClick={handleSave} disabled={pending}
                className="grid size-7 place-items-center rounded-lg text-success hover:bg-success/10">
                {pending ? <div className="size-3.5 animate-spin rounded-full border-2 border-success border-t-transparent" /> : <Check className="size-3.5" />}
              </button>
              <button onClick={() => setMode("view")}
                className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
                <X className="size-3.5" />
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  return (
    <tr className="border-b border-line-soft last:border-0">
      <td className="p-4 font-medium">{r.description}</td>
      <td className="hidden p-4 text-ink-muted sm:table-cell">{r.category}</td>
      <td className="hidden p-4 text-ink-muted md:table-cell">{r.fund}</td>
      <td className="hidden p-4 text-ink-muted lg:table-cell">{formatDate(r.date)}</td>
      <td className="p-4">
        {r.source === "giving"
          ? <Badge variant="success" className="text-[10px]">Giving</Badge>
          : <Badge variant="outline" className="text-[10px]">Manual</Badge>}
      </td>
      <td className={cn("p-4 text-right font-semibold", r.amount >= 0 ? "text-success" : "text-ink")}>
        {r.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(r.amount))}
      </td>
      {canWrite && (
        <td className="p-4 text-right">
          {r.source === "manual" ? (
            mode === "delete" ? (
              <div className="flex items-center justify-end gap-1">
                <span className="text-xs text-danger">Delete?</span>
                <button onClick={handleDelete} disabled={pending}
                  className="grid size-7 place-items-center rounded-lg text-danger hover:bg-danger/10">
                  {pending ? <div className="size-3.5 animate-spin rounded-full border-2 border-danger border-t-transparent" /> : <Check className="size-3.5" />}
                </button>
                <button onClick={() => setMode("view")}
                  className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => setMode("edit")} title="Edit transaction"
                  className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => setMode("delete")} title="Delete transaction"
                  className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          ) : null}
        </td>
      )}
    </tr>
  );
}

/* ────── Monthly Report ────── */

function MonthlyReport({
  weeks, income, expenses, fundBalances, monthLabel, year, month,
}: {
  weeks: AccountingWeek[];
  income: number;
  expenses: number;
  fundBalances: { fund: string; balance: number }[];
  monthLabel: string;
  year: number;
  month: number;
}) {
  const net = income - expenses;
  const allGiving = weeks.flatMap((w) => w.givingIncome);
  const allManual = weeks.flatMap((w) => w.transactions);
  const manualIncome = allManual.filter((r) => r.amount >= 0).reduce((s, r) => s + r.amount, 0);
  const manualExpenses = allManual.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const givingTotal = allGiving.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Financial report — {monthLabel}</h3>
            <p className="text-sm text-ink-muted">{allGiving.length + allManual.length} total transactions</p>
          </div>
          <a href={`/api/export/transactions?year=${year}&month=${month}`}>
            <Button variant="secondary" size="sm"><Download className="size-4" /> Export CSV</Button>
          </a>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Total income</div>
            <div className="mt-1 font-display text-2xl font-bold text-success">{formatCurrency(income, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Total expenses</div>
            <div className="mt-1 font-display text-2xl font-bold">{formatCurrency(expenses, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Net balance</div>
            <div className={cn("mt-1 font-display text-2xl font-bold", net >= 0 ? "text-success" : "text-danger")}>{formatCurrency(net, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">From giving</div>
            <div className="mt-1 font-display text-2xl font-bold text-success">{formatCurrency(givingTotal, { decimals: true })}</div>
          </div>
        </div>
      </Card>

      {/* Weekly breakdown */}
      <Card className="overflow-hidden">
        <div className="border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Weekly breakdown</h3>
        </div>
        <div className="divide-y divide-line-soft">
          {weeks.map((w) => {
            const wNet = w.income - w.expenses;
            return (
              <div key={w.label} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm font-medium">{w.label}</span>
                  <span className="ml-2 text-xs text-ink-faint">{formatDate(w.startDate)} — {formatDate(w.endDate)}</span>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-success">+{formatCurrency(w.income)}</span>
                  <span className="text-xs text-ink">{w.expenses > 0 ? `−${formatCurrency(w.expenses)}` : "—"}</span>
                  <span className={cn("font-display font-semibold", wNet >= 0 ? "text-success" : "text-danger")}>
                    {wNet >= 0 ? "+" : "−"}{formatCurrency(Math.abs(wNet))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Fund balances */}
      {fundBalances.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Fund balances</h3>
            <p className="text-sm text-ink-muted">Net by fund for {monthLabel}</p>
          </div>
          <div className="divide-y divide-line-soft">
            {fundBalances.map((f) => (
              <div key={f.fund} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm font-medium">{f.fund}</span>
                <span className={cn("font-display font-semibold", f.balance >= 0 ? "text-success" : "text-danger")}>
                  {formatCurrency(f.balance, { decimals: true })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Income breakdown */}
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Income sources</h3>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm"><HandCoins className="size-4 text-success" /> Giving (tithes, offerings, donations)</div>
            <span className="font-semibold text-success">{formatCurrency(givingTotal, { decimals: true })}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm"><Banknote className="size-4 text-ink-faint" /> Other income (manual entries)</div>
            <span className="font-semibold text-success">{formatCurrency(manualIncome, { decimals: true })}</span>
          </div>
          <div className="border-t border-line pt-3 flex items-center justify-between">
            <div className="text-sm font-medium">Total expenses</div>
            <span className="font-semibold">{formatCurrency(manualExpenses, { decimals: true })}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
