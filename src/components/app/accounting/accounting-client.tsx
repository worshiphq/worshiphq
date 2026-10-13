"use client";

import { useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Calendar, Search, X, AlertTriangle, TrendingUp, TrendingDown, Scale, ListChecks,
  LayoutDashboard, Rows3, Landmark, PiggyBank, FileText, SlidersHorizontal,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { AccountsManager, type AccountRow } from "@/components/app/accounts-manager";
import { FundsManager, type FundRow } from "@/components/app/funds-manager";
import { formatCurrency } from "@/config/brand";
import { wideYears } from "@/lib/years";
import { cn } from "@/lib/utils";
import type { Ledger } from "@/lib/data/ledger";
import { AccountsContext, EntriesView } from "./entries";
import { OverviewView } from "./overview";
import { PeriodsView } from "./periods";
import { StatementsView } from "./statements";
import { ReportView } from "./report";
import { UnassignedModal } from "./unassigned";
import { MONTHS, fieldCls, useLedgerNav, type LedgerAccount } from "./shared";

type Tab = "overview" | "entries" | "periods" | "statements" | "funds" | "report";

interface Props {
  ledger: Ledger;
  accounts: AccountRow[];
  funds: FundRow[];
  unassigned?: { count: number; net: number; defaultAccount: string };
  /** Money received but not banked into an account yet. */
  notBanked?: { count: number; total: number };
  canWrite: boolean;
  canDelete: boolean;
}

export function AccountingClient({ ledger, accounts, funds, unassigned, notBanked, canWrite, canDelete }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [stmtAccount, setStmtAccount] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "");
  const nav = useLedgerNav(ledger);
  const ledgerAccounts: LedgerAccount[] = accounts.map((a) => ({ id: a.id, name: a.name, isDefault: a.isDefault }));
  const { totals, previous } = ledger;

  const tabs: { id: Tab; label: string; icon: typeof Calendar }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "entries", label: "Entries", icon: Rows3 },
    { id: "periods", label: ledger.bucketKind === "week" ? "By week" : "By month", icon: Calendar },
    { id: "statements", label: "Statements", icon: Landmark },
    { id: "funds", label: "Funds", icon: PiggyBank },
    { id: "report", label: "Report", icon: FileText },
  ];

  return (
    <AccountsContext.Provider value={ledgerAccounts}>
      <div className="space-y-5">
        <AccountsManager accounts={accounts} canWrite={canWrite} onStatement={(id) => { setStmtAccount(id); setTab("statements"); }} />

        <PeriodBar ledger={ledger} />
        <FilterBar ledger={ledger} accounts={ledgerAccounts} />

        {/* Key numbers for what's selected above */}
        <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity", nav.pending && "opacity-50")}>
          <Kpi label="Income" value={totals.income} tone="success" icon={TrendingUp} prev={previous ? { label: previous.label, v: previous.income } : null} good="up" />
          <Kpi label="Expenses" value={totals.expenses} icon={TrendingDown} prev={previous ? { label: previous.label, v: previous.expenses } : null} good="down" />
          <Kpi label="Net" value={totals.net} tone={totals.net >= 0 ? "success" : "danger"} icon={Scale} prev={previous ? { label: previous.label, v: previous.net } : null} good="up" />
          <Kpi label="Entries" value={totals.count} icon={ListChecks} plain />
        </div>

        {canWrite && notBanked && notBanked.count > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <b>{formatCurrency(notBanked.total, { decimals: true })}</b> received in <b>{notBanked.count} {notBanked.count === 1 ? "entry" : "entries"}</b> is not banked yet, so it isn&apos;t in any account balance. Assign each one to an account once it is deposited.
            </span>
            <button onClick={() => setShowUnassigned(true)} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Bank it</button>
          </div>
        )}

        {canWrite && unassigned && unassigned.count > 0 && accounts.length >= 2 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <b>{unassigned.count} {unassigned.count === 1 ? "entry" : "entries"}</b> ({formatCurrency(Math.abs(unassigned.net))}) {unassigned.net < 0 ? "out" : "in"} have no bank account - currently counted under <b>{unassigned.defaultAccount}</b>.
            </span>
            <button onClick={() => setShowUnassigned(true)} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Review &amp; assign</button>
          </div>
        )}

        {/* Tabs */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex min-w-full gap-1 rounded-xl bg-surface-2 p-1 sm:grid sm:min-w-0 sm:grid-cols-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                )}
              >
                <t.icon className="size-4 shrink-0" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className={cn("transition-opacity", nav.pending && tab !== "entries" && tab !== "periods" && "opacity-60")}>
          {tab === "overview" && <OverviewView ledger={ledger} />}
          {tab === "entries" && <EntriesView ledger={ledger} canWrite={canWrite} canDelete={canDelete} />}
          {tab === "periods" && <PeriodsView ledger={ledger} onOpen={() => setTab("entries")} />}
          {tab === "statements" && <StatementsView accounts={ledgerAccounts} ledger={ledger} accountId={stmtAccount} onAccount={setStmtAccount} />}
          {tab === "funds" && <FundsManager funds={funds} canWrite={canWrite} />}
          {tab === "report" && <ReportView ledger={ledger} />}
        </div>

        {showUnassigned && <UnassignedModal onClose={() => setShowUnassigned(false)} />}
      </div>
    </AccountsContext.Provider>
  );
}

/* ────── KPI card ────── */

function Kpi({ label, value, icon: Icon, tone, prev, good, plain }: {
  label: string; value: number; icon: typeof Scale; tone?: "success" | "danger";
  prev?: { label: string; v: number } | null; good?: "up" | "down"; plain?: boolean;
}) {
  let delta: { pct: number; ok: boolean } | null = null;
  if (prev && prev.v !== 0) {
    const pct = Math.round(((value - prev.v) / Math.abs(prev.v)) * 100);
    delta = { pct, ok: good === "up" ? pct >= 0 : pct <= 0 };
  }
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface-2 text-primary-bright"><Icon className="size-4" /></span>
      </div>
      <div className={cn("mt-2 font-display text-2xl font-bold tracking-tight", tone === "success" && "text-success", tone === "danger" && "text-danger")}>
        {plain ? <AnimatedNumber value={value} /> : <><span className="mr-0.5">{value < 0 ? "−" : ""}₵</span><AnimatedNumber value={Math.abs(value)} /></>}
      </div>
      {delta && prev && (
        <div className="mt-1.5 text-[11px] text-ink-faint">
          <span className={cn("font-semibold", delta.ok ? "text-success" : "text-danger")}>{delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct)}%</span> vs {prev.label}
        </div>
      )}
    </div>
  );
}

/* ────── Period picker ────── */

export function PeriodBar({ ledger }: { ledger: Ledger }) {
  const nav = useLedgerNav(ledger);
  const { period } = ledger;
  const years = wideYears();
  const [from, setFrom] = useState(period.from ?? ledger.fromYmd ?? "");
  const [to, setTo] = useState(period.to ?? ledger.toYmd ?? "");

  const step = (dir: -1 | 1) => {
    if (period.kind === "month") {
      const m = period.month + dir;
      nav.go({ period: m < 0 ? { year: period.year - 1, month: 11 } : m > 11 ? { year: period.year + 1, month: 0 } : { month: m } });
    } else if (period.kind === "year") nav.go({ period: { year: period.year + dir } });
  };
  const now = new Date();
  const kinds: { id: "month" | "year" | "all" | "custom"; label: string }[] = [
    { id: "month", label: "Month" }, { id: "year", label: "Year" }, { id: "all", label: "All time" }, { id: "custom", label: "Custom" },
  ];

  return (
    <Card className="p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
          {kinds.map((k) => (
            <button
              key={k.id}
              onClick={() => nav.go({ period: k.id === "month" ? { kind: "month", year: now.getFullYear(), month: now.getMonth() } : k.id === "year" ? { kind: "year", year: period.kind === "month" ? period.year : now.getFullYear() } : k.id === "custom" ? { kind: "custom", from: from || ledger.fromYmd || "", to: to || ledger.toYmd || "" } : { kind: "all" } })}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", period.kind === k.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
            >
              {k.label}
            </button>
          ))}
        </div>

        {(period.kind === "month" || period.kind === "year") && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => step(-1)} className="grid size-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2" aria-label="Previous"><ChevronLeft className="size-4" /></button>
            {period.kind === "month" && (
              <select value={period.month} onChange={(e) => nav.go({ period: { month: Number(e.target.value) } })} className={fieldCls}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}
            <select value={period.year} onChange={(e) => nav.go({ period: { year: Number(e.target.value) } })} className={fieldCls}>
              {(years.includes(period.year) ? years : [period.year, ...years]).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => step(1)} className="grid size-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2" aria-label="Next"><ChevronRight className="size-4" /></button>
          </div>
        )}

        {period.kind === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls} />
            <span className="text-ink-faint">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls} />
            <Button size="sm" disabled={!from || !to || nav.pending} onClick={() => nav.go({ period: { kind: "custom", from, to } })}>Apply</Button>
          </div>
        )}

        <span className="ml-auto flex items-center gap-1.5 text-sm font-medium text-ink-muted">
          <Calendar className="size-4 text-ink-faint" /> Showing {ledger.label}
          {nav.pending && <span className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
        </span>
      </div>
    </Card>
  );
}

/* ────── Filters ────── */

export function FilterBar({ ledger, accounts, variant = "ledger", placeholder }: { ledger: Ledger; accounts: LedgerAccount[]; variant?: "ledger" | "expenses"; placeholder?: string }) {
  const nav = useLedgerNav(ledger);
  const f = ledger.filters;
  const [q, setQ] = useState(f.q);
  const [open, setOpen] = useState(ledger.activeFilters > 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in step when filters are cleared from elsewhere.
  const [seenQ, setSeenQ] = useState(f.q);
  if (seenQ !== f.q) { setSeenQ(f.q); setQ(f.q); }

  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => nav.go({ filters: { q: v.trim() } }), 450);
  };
  const sel = cn(fieldCls, "min-w-0");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder ?? "Search description, category or fund…"} className={cn(fieldCls, "h-10 w-full pl-9")} />
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} className="h-10">
          <SlidersHorizontal className="size-4" /> Filters{ledger.activeFilters > 0 ? ` (${ledger.activeFilters})` : ""}
        </Button>
        {ledger.activeFilters > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { nav.clearFilters(); setQ(""); }} className="h-10 text-danger"><X className="size-4" /> Clear</Button>
        )}
      </div>
      {open && (
        <div className="grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-5">
          {variant === "ledger" && (
            <>
              <Labeled label="Type">
                <select value={f.type} onChange={(e) => nav.go({ filters: { type: e.target.value as typeof f.type } })} className={sel}>
                  <option value="">Income and expenses</option><option value="income">Income only</option><option value="expense">Expenses only</option>
                </select>
              </Labeled>
              <Labeled label="Source">
                <select value={f.source} onChange={(e) => nav.go({ filters: { source: e.target.value as typeof f.source } })} className={sel}>
                  <option value="">All sources</option><option value="giving">Giving</option><option value="expense">Expense records</option><option value="manual">Manual entries</option>
                </select>
              </Labeled>
            </>
          )}
          {accounts.length > 0 && (
            <Labeled label="Account">
              <select value={f.account} onChange={(e) => nav.go({ filters: { account: e.target.value } })} className={sel}>
                <option value="">All accounts</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value="none">No account assigned</option>
              </select>
            </Labeled>
          )}
          {variant === "ledger" && (
            <Labeled label="Fund">
              <select value={f.fund} onChange={(e) => nav.go({ filters: { fund: e.target.value } })} className={sel}>
                <option value="">All funds</option>
                {ledger.options.funds.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Labeled>
          )}
          <Labeled label="Category">
            <select value={f.category} onChange={(e) => nav.go({ filters: { category: e.target.value } })} className={sel}>
              <option value="">All categories</option>
              {ledger.options.categories.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Labeled>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}
