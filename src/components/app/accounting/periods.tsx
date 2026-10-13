"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Ledger } from "@/lib/data/ledger";
import { useLedgerNav } from "./shared";

const money = (n: number) => formatCurrency(n, { decimals: false });

/** Week by week (inside a month) or month by month (for a year / all time). Open any row to see its entries. */
export function PeriodsView({ ledger, onOpen }: { ledger: Ledger; onOpen: () => void }) {
  const nav = useLedgerNav(ledger);
  const { buckets, totals } = ledger;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expenses)));
  const week = ledger.bucketKind === "week";

  return (
    <Card className={cn("overflow-hidden p-0 transition-opacity", nav.pending && "opacity-50")}>
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-display text-[1rem] font-semibold">{week ? "Week by week" : "Month by month"}</h3>
        <p className="text-xs text-ink-muted">{ledger.label}. Press View to see exactly what was recorded then.</p>
      </div>

      {buckets.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-ink-faint">Nothing recorded in this period yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-2.5 font-medium">{week ? "Week" : "Month"}</th>
                <th className="px-3 py-2.5 text-right font-medium">Income</th>
                <th className="px-3 py-2.5 text-right font-medium">Expenses</th>
                <th className="px-3 py-2.5 text-right font-medium">Net</th>
                <th className="hidden w-32 px-3 py-2.5 font-medium sm:table-cell" />
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {buckets.map((b) => {
                const net = b.income - b.expenses;
                const empty = b.count === 0;
                return (
                  <tr key={b.key} className={cn(empty && "text-ink-faint")}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{week ? b.label : b.sub}</div>
                      <div className="text-xs text-ink-faint">{week ? b.sub : b.label.split(" ")[1]} · {b.count} {b.count === 1 ? "entry" : "entries"}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-success">{empty ? "-" : money(b.income)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-danger">{b.expenses ? money(b.expenses) : "-"}</td>
                    <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", empty ? "" : net >= 0 ? "text-ink" : "text-danger")}>{empty ? "-" : `${net < 0 ? "−" : ""}${money(Math.abs(net))}`}</td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      {!empty && (
                        <div className="space-y-1">
                          <div className="h-1.5 rounded-full bg-success/70" style={{ width: `${(b.income / max) * 100}%` }} />
                          {b.expenses > 0 && <div className="h-1.5 rounded-full bg-danger/60" style={{ width: `${(b.expenses / max) * 100}%` }} />}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!empty && (
                        <Button size="sm" variant="ghost" disabled={nav.pending} onClick={() => { nav.go({ period: { kind: "custom", from: b.from, to: b.to } }); onOpen(); }}>
                          View
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-line bg-surface-2/40 font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums text-success">{money(totals.income)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-danger">{money(totals.expenses)}</td>
                <td className={cn("px-3 py-3 text-right tabular-nums", totals.net >= 0 ? "" : "text-danger")}>{totals.net < 0 ? "−" : ""}{money(Math.abs(totals.net))}</td>
                <td className="hidden sm:table-cell" />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
