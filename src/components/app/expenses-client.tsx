"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt, Trash2, Store, FileText, UserCheck, Landmark, ChevronLeft, ChevronRight, Inbox,
  TrendingDown, Hash, PieChart, CalendarClock, ListChecks, BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteExpense } from "@/app/actions/expenses";
import { PeriodBar, FilterBar } from "@/components/app/accounting/accounting-client";
import { Breakdown } from "@/components/app/accounting/overview";
import { useLedgerNav, type LedgerAccount } from "@/components/app/accounting/shared";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Ledger } from "@/lib/data/ledger";

type Detail = { description: string; vendor: string | null; receiptRef: string | null; approvedBy: string | null };

const money = (n: number) => formatCurrency(n, { decimals: true });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function ExpensesClient({ ledger, accounts, details, payees, canWrite, canDelete }: {
  ledger: Ledger;
  accounts: LedgerAccount[];
  details: Record<string, Detail>;
  payees: { name: string; total: number; count: number }[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [tab, setTab] = useState<"records" | "summary">("records");
  const nav = useLedgerNav(ledger);
  const { totals, previous, buckets, byCategory } = ledger;
  const spent = totals.expenses;

  const top = [...byCategory].sort((a, b) => b.expenses - a.expenses)[0];
  const active = buckets.filter((b) => b.expenses > 0);
  const avg = active.length ? spent / active.length : 0;
  const week = ledger.bucketKind === "week";
  const delta = previous && previous.expenses > 0 ? Math.round(((spent - previous.expenses) / previous.expenses) * 100) : null;

  return (
    <div className="mt-5 space-y-4">
      <PeriodBar ledger={ledger} />
      <FilterBar ledger={ledger} accounts={accounts} variant="expenses" placeholder="Search description, payee or category…" />

      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity", nav.pending && "opacity-50")}>
        <Kpi icon={TrendingDown} label="Total spent" value={money(spent)} note={delta != null && previous ? <span className={delta <= 0 ? "text-success" : "text-danger"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs {previous.label}</span> : null} />
        <Kpi icon={Hash} label="Records" value={String(totals.count)} />
        <Kpi icon={PieChart} label="Biggest category" value={top && top.expenses > 0 ? top.name : "-"} note={top && top.expenses > 0 ? money(top.expenses) : null} small />
        <Kpi icon={CalendarClock} label={`Average per ${week ? "week" : "month"}`} value={money(avg)} note={active.length ? `over ${active.length} ${week ? "week" : "month"}${active.length === 1 ? "" : "s"} with spending` : null} />
      </div>

      <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
        {([["records", "Records", ListChecks], ["summary", "Summary & report", BarChart3]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "records" ? (
        <Records ledger={ledger} details={details} accounts={accounts} canWrite={canWrite} canDelete={canDelete} />
      ) : (
        <Summary ledger={ledger} payees={payees} accounts={accounts} onOpen={() => setTab("records")} />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, note, small }: { icon: typeof Receipt; label: string; value: string; note?: React.ReactNode; small?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface-2 text-primary-bright"><Icon className="size-4" /></span>
      </div>
      <div className={cn("mt-2 truncate font-display font-bold tracking-tight tabular-nums", small ? "text-xl" : "text-2xl")}>{value}</div>
      {note ? <div className="mt-1 text-[11px] text-ink-faint">{note}</div> : null}
    </div>
  );
}

/* ────── The records (paged, grouped by day) ────── */

function Records({ ledger, details, accounts, canWrite, canDelete }: { ledger: Ledger; details: Record<string, Detail>; accounts: LedgerAccount[]; canWrite: boolean; canDelete: boolean }) {
  const nav = useLedgerNav(ledger);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const { rows, pageInfo, filters } = ledger;
  const shown = rows.filter((r) => !hidden.has(r.id));
  const acctName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

  const remove = (id: string) => {
    if (!confirmBinDelete("Delete this expense?")) return;
    const fd = new FormData();
    fd.set("id", id);
    setHidden((p) => new Set(p).add(id));
    start(async () => { await deleteExpense(fd); binDeleted(); router.refresh(); });
  };

  let lastDay = "";
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-display text-[1rem] font-semibold">Expense records</h3>
          <p className="text-xs text-ink-muted">{pageInfo.total === 0 ? "Nothing matches" : `${pageInfo.total.toLocaleString()} ${pageInfo.total === 1 ? "record" : "records"}`}{ledger.activeFilters > 0 ? " with your filters" : ` · ${ledger.label}`}</p>
        </div>
        <select value={filters.sort} onChange={(e) => nav.go({ filters: { sort: e.target.value as typeof filters.sort } })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="largest">Largest first</option>
        </select>
      </div>

      <div className={cn("transition-opacity", (nav.pending || pending) && "opacity-50")}>
        {shown.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-14 text-center text-sm text-ink-muted">
            <Inbox className="size-8 text-ink-faint/60" />
            {ledger.activeFilters > 0 ? <>No expenses match.<Button size="sm" variant="secondary" onClick={nav.clearFilters}>Clear filters</Button></> : "No expenses recorded in this period."}
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {shown.map((r) => {
              const d = details[r.id];
              const day = r.date.slice(0, 10);
              const heading = filters.sort !== "largest" && day !== lastDay ? ((lastDay = day), dayLabel(r.date)) : null;
              const account = acctName(r.accountId);
              return (
                <div key={r.id}>
                  {heading && <div className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{heading}</div>}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-danger/10 text-danger"><Receipt className="size-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{d?.description ?? r.description}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-muted">{r.category}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs text-ink-faint">
                        {d?.vendor && <span className="flex items-center gap-1"><Store className="size-3" /> {d.vendor}</span>}
                        {d?.receiptRef && <span className="flex items-center gap-1"><FileText className="size-3" /> {d.receiptRef}</span>}
                        {d?.approvedBy && <span className="flex items-center gap-1"><UserCheck className="size-3" /> {d.approvedBy}</span>}
                        {account && <span className="flex items-center gap-1"><Landmark className="size-3" /> {account}</span>}
                      </div>
                    </div>
                    <span className="whitespace-nowrap font-display text-sm font-semibold tabular-nums text-danger">−{money(-r.amount)}</span>
                    {canWrite && canDelete && (
                      <button onClick={() => remove(r.id)} className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-4" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pageInfo.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink-faint">{(pageInfo.page - 1) * pageInfo.pageSize + 1}-{Math.min(pageInfo.total, pageInfo.page * pageInfo.pageSize)} of {pageInfo.total.toLocaleString()}</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" disabled={pageInfo.page <= 1 || nav.pending} onClick={() => nav.go({ filters: { page: pageInfo.page - 1 } })}><ChevronLeft className="size-4" /> Prev</Button>
            <span className="px-1 text-xs text-ink-muted">Page {pageInfo.page} of {pageInfo.pages}</span>
            <Button size="sm" variant="secondary" disabled={pageInfo.page >= pageInfo.pages || nav.pending} onClick={() => nav.go({ filters: { page: pageInfo.page + 1 } })}>Next <ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ────── Summary / mini report ────── */

function Summary({ ledger, payees, accounts, onOpen }: { ledger: Ledger; payees: { name: string; total: number; count: number }[]; accounts: LedgerAccount[]; onOpen: () => void }) {
  const nav = useLedgerNav(ledger);
  const week = ledger.bucketKind === "week";
  const max = Math.max(1, ...ledger.buckets.map((b) => b.expenses));
  const acct = ledger.byAccount.filter((a) => a.expenses > 0);

  return (
    <div className={cn("space-y-4 transition-opacity", nav.pending && "opacity-50")}>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-5 py-3">
          <h3 className="font-display text-[1rem] font-semibold">{week ? "Spending week by week" : "Spending month by month"}</h3>
          <p className="text-xs text-ink-muted">{ledger.label}</p>
        </div>
        {ledger.buckets.every((b) => b.expenses === 0) ? (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">Nothing spent in this period.</p>
        ) : (
          <div className="divide-y divide-line-soft">
            {ledger.buckets.map((b) => (
              <div key={b.key} className="flex items-center gap-3 px-5 py-3">
                <div className="w-28 shrink-0">
                  <div className="text-sm font-medium">{week ? b.label : b.sub}</div>
                  <div className="text-xs text-ink-faint">{week ? b.sub : b.label.split(" ")[1]}</div>
                </div>
                <div className="hidden h-2 flex-1 overflow-hidden rounded-full bg-surface-2 sm:block">
                  <div className="h-full rounded-full bg-danger/60" style={{ width: `${(b.expenses / max) * 100}%` }} />
                </div>
                <div className="ml-auto w-28 text-right text-sm font-semibold tabular-nums">{b.expenses ? money(b.expenses) : <span className="text-ink-faint">-</span>}</div>
                <div className="w-14 text-right">
                  {b.expenses > 0 && (
                    <button onClick={() => { nav.go({ period: { kind: "custom", from: b.from, to: b.to } }); onOpen(); }} className="text-xs font-medium text-primary hover:underline">View</button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-surface-2/40 px-5 py-3 text-sm font-semibold">
              <span>Total</span><span className="tabular-nums text-danger">{money(ledger.totals.expenses)}</span>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="By category" subtitle="Where the money went" items={ledger.byCategory} side="expenses" empty="No spending in this period." />
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">Top payees</h3>
          <p className="text-xs text-ink-muted">Who was paid the most</p>
          {payees.length === 0 ? (
            <p className="mt-4 text-sm text-ink-faint">No payees recorded. Add a vendor when you record an expense.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft">
              {payees.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-medium">{p.name}<span className="ml-1.5 text-xs font-normal text-ink-faint">{p.count}×</span></span>
                  <span className="shrink-0 tabular-nums">{money(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {acct.length > 1 && (
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">Paid from</h3>
          <ul className="mt-3 divide-y divide-line-soft">
            {acct.map((a) => (
              <li key={a.accountId ?? "none"} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{accounts.find((x) => x.id === a.accountId)?.name ?? "No account"}</span>
                <span className="tabular-nums">{money(a.expenses)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
