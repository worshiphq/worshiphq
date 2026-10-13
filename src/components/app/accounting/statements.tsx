"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadAccountStatement } from "@/app/actions/accounting";
import type { AccountStatement } from "@/lib/data/accounts";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Ledger } from "@/lib/data/ledger";
import type { LedgerAccount } from "./shared";

const money = (n: number) => formatCurrency(n, { decimals: true });

/**
 * A bank-statement view of ONE account: opening balance, every movement with the
 * balance after it, and the closing balance. Follows the period chosen above, or
 * every date. Paginated.
 */
export function StatementsView({ accounts, ledger, accountId, onAccount }: { accounts: LedgerAccount[]; ledger: Ledger; accountId: string; onAccount: (id: string) => void }) {
  const [range, setRange] = useState<"period" | "all">(ledger.fromYmd ? "period" : "all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AccountStatement | null>(null);
  const [error, setError] = useState(false);
  const [loading, start] = useTransition();

  const from = range === "period" ? ledger.fromYmd : null;
  const to = range === "period" ? ledger.toYmd : null;

  useEffect(() => {
    if (!accountId) return;
    start(async () => {
      const res = await loadAccountStatement(accountId, from, to, page);
      setError(!res.ok);
      setData(res.ok ? res.statement : null);
    });
  }, [accountId, from, to, page]);

  if (accounts.length === 0) {
    return <Card className="p-8 text-center text-sm text-ink-muted">Add a bank, Mobile Money or cash account first, then its statement shows here.</Card>;
  }

  let lastDay = "";
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select value={accountId} onChange={(e) => { setPage(1); onAccount(e.target.value); }} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isDefault ? " (default)" : ""}</option>)}
          </select>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5 text-xs">
            {ledger.fromYmd && (
              <button onClick={() => { setPage(1); setRange("period"); }} className={cn("rounded-md px-2.5 py-1.5 font-medium", range === "period" ? "bg-surface shadow-sm" : "text-ink-muted")}>{ledger.label}</button>
            )}
            <button onClick={() => { setPage(1); setRange("all"); }} className={cn("rounded-md px-2.5 py-1.5 font-medium", range === "all" ? "bg-surface shadow-sm" : "text-ink-muted")}>All dates</button>
          </div>
        </div>
        {data && <div className="text-right"><div className="text-[11px] text-ink-faint">Balance now</div><div className={cn("font-display text-lg font-bold", data.current < 0 && "text-danger")}>{money(data.current)}</div></div>}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-px border-b border-line bg-line-soft sm:grid-cols-4">
          {[
            ["Opening balance", data.startBalance, ""],
            ["Money in", data.totalIn, "text-success"],
            ["Money out", -data.totalOut, "text-danger"],
            ["Closing balance", data.endBalance, ""],
          ].map(([label, v, tone]) => (
            <div key={label as string} className="bg-surface p-3.5">
              <div className="text-[11px] text-ink-faint">{label as string}</div>
              <div className={cn("mt-0.5 font-display text-[1rem] font-bold tabular-nums", tone as string)}>
                {(v as number) < 0 && label === "Money out" ? "−" : ""}{money(Math.abs(v as number))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={cn("transition-opacity", loading && "opacity-50")}>
        {error ? (
          <p className="p-10 text-center text-sm text-ink-muted">Couldn&rsquo;t load this statement.</p>
        ) : !data ? (
          <p className="p-10 text-center text-sm text-ink-muted">Loading…</p>
        ) : data.rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-faint">No movements {range === "period" ? `in ${ledger.label}` : "yet"}.</p>
        ) : (
          <div className="divide-y divide-line-soft">
            {data.rows.map((r) => {
              const day = r.date.slice(0, 10);
              const head = day !== lastDay ? ((lastDay = day), new Date(r.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : null;
              return (
                <div key={r.id}>
                  {head && <div className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{head}</div>}
                  <div className="flex items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{r.description}</span>
                        {r.source === "giving" && <Badge variant="success" className="shrink-0 text-[10px]">Giving</Badge>}
                        {r.source === "expense" && <Badge variant="danger" className="shrink-0 text-[10px]">Expense</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-faint tabular-nums">{money(r.balanceBefore)} → <span className="font-medium text-ink-muted">{money(r.balanceAfter)}</span></div>
                    </div>
                    <div className={cn("whitespace-nowrap text-right text-sm font-semibold tabular-nums", r.amount >= 0 ? "text-success" : "text-danger")}>
                      {r.amount >= 0 ? "+" : "−"}{money(Math.abs(r.amount))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink-faint">{data.total.toLocaleString()} movements</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /> Newer</Button>
            <span className="px-1 text-xs text-ink-muted">Page {data.page} of {data.pages}</span>
            <Button size="sm" variant="secondary" disabled={page >= data.pages || loading} onClick={() => setPage(page + 1)}>Older <ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}
