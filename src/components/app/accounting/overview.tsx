"use client";

import { useContext } from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Ledger, NameTotal } from "@/lib/data/ledger";
import { AccountsContext } from "./entries";

const money = (n: number) => formatCurrency(n, { decimals: false });

/** Income (green) and expenses (red) side by side for each week or month. */
export function BucketChart({ ledger }: { ledger: Ledger }) {
  // Years of months would be unreadable; show the most recent 24.
  const buckets = ledger.buckets.slice(-24);
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expenses)));
  if (buckets.length === 0 || buckets.every((b) => b.count === 0)) {
    return <p className="py-10 text-center text-sm text-ink-faint">Nothing recorded in this period yet.</p>;
  }
  return (
    <div>
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="flex h-44 items-end gap-2 pb-1" style={{ minWidth: buckets.length * 44 }}>
          {buckets.map((b) => (
            <div key={b.key} className="flex h-full min-w-9 flex-1 flex-col justify-end" title={`${b.label}\nIncome ${money(b.income)}\nExpenses ${money(b.expenses)}`}>
              <div className="flex flex-1 items-end justify-center gap-1">
                <div className="w-3.5 rounded-t bg-success/80" style={{ height: `${Math.max(b.income ? 3 : 0, (b.income / max) * 100)}%` }} />
                <div className="w-3.5 rounded-t bg-danger/70" style={{ height: `${Math.max(b.expenses ? 3 : 0, (b.expenses / max) * 100)}%` }} />
              </div>
              <div className="mt-1.5 truncate text-center text-[10px] text-ink-faint">{ledger.bucketKind === "week" ? b.label.replace("Week ", "W") : b.label.split(" ")[0]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success/80" /> Income</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger/70" /> Expenses</span>
      </div>
    </div>
  );
}

/** A ranked list with proportional bars: where money came from or went. */
export function Breakdown({ title, subtitle, items, side, empty }: { title: string; subtitle?: string; items: NameTotal[]; side: "income" | "expenses"; empty: string }) {
  const list = items.map((i) => ({ name: i.name, value: side === "income" ? i.income : i.expenses })).filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  const top = list.slice(0, 7);
  const rest = list.slice(7);
  if (rest.length) top.push({ name: `Other (${rest.length})`, value: rest.reduce((s, i) => s + i.value, 0) });
  return (
    <Card className="p-5">
      <h3 className="font-display text-[1rem] font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      {top.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {top.map((i) => (
            <li key={i.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{i.name}</span>
                <span className="shrink-0 tabular-nums">
                  {money(i.value)} <span className="text-xs text-ink-faint">{Math.round((i.value / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className={cn("h-full rounded-full", side === "income" ? "bg-success/70" : "bg-danger/60")} style={{ width: `${(i.value / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function OverviewView({ ledger }: { ledger: Ledger }) {
  const accounts = useContext(AccountsContext);
  const nameOf = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "No account";
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-display text-[1rem] font-semibold">Income and expenses</h3>
            <p className="text-xs text-ink-muted">{ledger.label} · by {ledger.bucketKind === "week" ? "week" : "month"}</p>
          </div>
        </div>
        <BucketChart ledger={ledger} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Where the money came from" subtitle="Income by category" items={ledger.byCategory} side="income" empty="No income in this period." />
        <Breakdown title="Where it went" subtitle="Expenses by category" items={ledger.byCategory} side="expenses" empty="No expenses in this period." />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">By account</h3>
          <p className="text-xs text-ink-muted">Money in and out of each account this period</p>
          {ledger.byAccount.length === 0 ? (
            <p className="mt-4 text-sm text-ink-faint">Nothing yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-line-soft">
              {ledger.byAccount.map((a) => (
                <div key={a.accountId ?? "none"} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-medium">{nameOf(a.accountId)}</span>
                  <span className="flex shrink-0 items-center gap-3 tabular-nums text-xs">
                    <span className="text-success">+{money(a.income)}</span>
                    <span className="text-danger">−{money(a.expenses)}</span>
                    <span className={cn("w-24 text-right text-sm font-semibold", a.income - a.expenses >= 0 ? "text-ink" : "text-danger")}>{money(a.income - a.expenses)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">By fund</h3>
          <p className="text-xs text-ink-muted">Income into each fund this period</p>
          <Fundlist items={ledger.byFund} />
        </Card>
      </div>
    </div>
  );
}

function Fundlist({ items }: { items: NameTotal[] }) {
  const list = items.filter((i) => i.income > 0).sort((a, b) => b.income - a.income);
  if (list.length === 0) return <p className="mt-4 text-sm text-ink-faint">No income yet.</p>;
  return (
    <div className="mt-3 divide-y divide-line-soft">
      {list.map((f) => (
        <div key={f.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0 truncate font-medium">{f.name}</span>
          <span className="shrink-0 font-semibold tabular-nums text-success">{money(f.income)}</span>
        </div>
      ))}
    </div>
  );
}
