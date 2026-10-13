"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Ledger } from "@/lib/data/ledger";
import { ledgerQuery } from "@/lib/ledger-query";

const money = (n: number) => formatCurrency(n, { decimals: true });

/** A tidy financial report for the period and filters picked above, ready to download. */
export function ReportView({ ledger }: { ledger: Ledger }) {
  const { totals, previous } = ledger;
  const qs = ledgerQuery(ledger.period, { ...ledger.filters, page: 1 }).toString();

  const income = ledger.byCategory.filter((c) => c.income > 0).sort((a, b) => b.income - a.income);
  const spend = ledger.byCategory.filter((c) => c.expenses > 0).sort((a, b) => b.expenses - a.expenses);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Financial report</h3>
            <p className="text-sm text-ink-muted">{ledger.label}{ledger.activeFilters > 0 ? " · filtered" : ""} · {totals.count.toLocaleString()} entries</p>
          </div>
          <div className="flex gap-2">
            <a href={`/api/export/transactions?${qs}`}><Button variant="secondary" size="sm"><Download className="size-4" /> CSV</Button></a>
            <a href={`/api/export/transactions?${qs}&format=xlsx`}><Button variant="secondary" size="sm"><FileSpreadsheet className="size-4" /> Excel</Button></a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Total income", totals.income, "text-success", previous?.income],
            ["Total expenses", totals.expenses, "", previous?.expenses],
            ["Net", totals.net, totals.net >= 0 ? "text-success" : "text-danger", previous?.net],
          ].map(([label, v, tone, prev]) => (
            <div key={label as string} className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
              <div className="text-sm text-ink-muted">{label as string}</div>
              <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone as string)}>{(v as number) < 0 ? "−" : ""}{money(Math.abs(v as number))}</div>
              {previous && <div className="mt-1 text-[11px] text-ink-faint">{previous.label}: {(prev as number) < 0 ? "−" : ""}{money(Math.abs(prev as number))}</div>}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Income by category" rows={income.map((c) => [c.name, c.income])} total={totals.income} tone="text-success" />
        <Table title="Expenses by category" rows={spend.map((c) => [c.name, c.expenses])} total={totals.expenses} tone="text-danger" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-5 py-3"><h3 className="font-display text-[1rem] font-semibold">{ledger.bucketKind === "week" ? "Weekly" : "Monthly"} summary</h3></div>
        {ledger.buckets.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">Nothing recorded.</p>
        ) : (
          <div className="divide-y divide-line-soft">
            {ledger.buckets.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium">{ledger.bucketKind === "week" ? b.label : b.label}</span> <span className="text-xs text-ink-faint">{ledger.bucketKind === "week" ? b.sub : ""}</span></span>
                <span className="flex shrink-0 gap-4 tabular-nums text-xs">
                  <span className="text-success">+{formatCurrency(b.income)}</span>
                  <span className="text-danger">{b.expenses ? `−${formatCurrency(b.expenses)}` : "-"}</span>
                  <span className={cn("w-24 text-right text-sm font-semibold", b.income - b.expenses >= 0 ? "" : "text-danger")}>{b.income - b.expenses < 0 ? "−" : ""}{formatCurrency(Math.abs(b.income - b.expenses))}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Table({ title, rows, total, tone }: { title: string; rows: [string, number][]; total: number; tone: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-line px-5 py-3"><h3 className="font-display text-[1rem] font-semibold">{title}</h3></div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">None in this period.</p>
      ) : (
        <>
          <div className="divide-y divide-line-soft">
            {rows.map(([name, v]) => (
              <div key={name} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">{name}</span>
                <span className={cn("shrink-0 font-medium tabular-nums", tone)}>{money(v)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t-2 border-line bg-surface-2/40 px-5 py-3 text-sm font-semibold">
            <span>Total</span><span className={cn("tabular-nums", tone)}>{money(total)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
