"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Inbox, Paperclip, Plus, Download, HandCoins, Search, Check, Repeat, ReceiptText, MoreHorizontal, Settings2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { decideExpenseRequest, recordRecurringNow, setApprovalThreshold } from "@/app/actions/expenses";
import { PeriodBar } from "@/components/app/accounting/accounting-client";
import { Breakdown } from "@/components/app/accounting/overview";
import { useLedgerNav, dayHeadings } from "@/components/app/accounting/shared";
import { ExpenseForm, type FormLists, type BudgetUse, type Vendor, type ExpenseValue } from "@/components/app/expenses/expense-form";
import { ExpenseSheet, type ExpenseDetail } from "@/components/app/expenses/expense-sheet";
import { ApprovalsPanel } from "@/components/app/expenses/approvals-panel";
import { RecurringPanel, type Recurring } from "@/components/app/expenses/recurring-panel";
import { Sheet, BusyButton, FormError, F, Select, money, fmtDate } from "@/components/app/shared/kit";
import { PAYMENT_METHODS, methodLabel } from "@/lib/assets/categories";
import { daysUntil } from "@/lib/fleet/due";
import type { Ledger } from "@/lib/data/ledger";
import type { ExpenseRequestRow } from "@/lib/data/expenses";
import { cn } from "@/lib/utils";

type Tab = "records" | "approvals" | "recurring" | "summary";
// Segment shades from one hue, darkest first; every segment also has a label under the bar.
const SEG = ["var(--color-primary)", "color-mix(in oklab, var(--color-primary) 75%, var(--color-surface))", "color-mix(in oklab, var(--color-primary) 55%, var(--color-surface))", "color-mix(in oklab, var(--color-primary) 38%, var(--color-surface))", "color-mix(in oklab, var(--color-primary) 24%, var(--color-surface))", "var(--color-line)"];

export function ExpensesClient(p: {
  ledger: Ledger;
  accounts: { id: string; name: string; isDefault: boolean }[];
  funds: { id: string; name: string; restricted: boolean; left: number }[];
  details: Record<string, ExpenseDetail>;
  payees: { name: string; total: number; count: number }[];
  pending: ExpenseRequestRow[];
  decided: { rows: ExpenseRequestRow[]; total: number; page: number };
  recurring: Recurring[];
  vendors: Vendor[];
  missingReceipts: number;
  budgets: BudgetUse[];
  byMethod: { method: string | null; total: number; count: number }[];
  categories: string[];
  topCategories: string[];
  approvalOver: number | null;
  exportQs: string;
  me: { id: string; isOwner: boolean; isAdmin: boolean };
  canWrite: boolean;
  canDelete: boolean;
  fundAccounting: boolean;
  budgetsOn: boolean;
}) {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((["records", "approvals", "recurring", "summary"] as Tab[]).find((t) => t === sp.get("tab")) ?? "records");
  const [form, setForm] = useState<null | { kind: "record" } | { kind: "request" } | { kind: "edit"; value: ExpenseValue } | { kind: "pay"; requestId: string; value: Partial<ExpenseValue> }>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const nav = useLedgerNav(p.ledger);
  const lists: FormLists = { accounts: p.accounts, funds: p.funds, vendors: p.vendors, budgets: p.budgets, categories: p.categories, topCategories: p.topCategories, fundAccounting: p.fundAccounting, budgetsOn: p.budgetsOn };
  const open = openId ? p.details[openId] : null;
  const dueSoon = p.recurring.filter((r) => r.active && daysUntil(r.nextDue) <= 7);
  const waiting = p.pending.filter((r) => r.status === "pending" || r.status === "approved");

  const toEdit = (d: ExpenseDetail): ExpenseValue => ({
    id: d.id, description: d.description, amount: d.amount, category: d.category, date: d.date, vendor: d.vendor, vendorId: d.vendorId, receiptRef: d.receiptRef,
    receiptUrl: d.receiptUrl, paymentMethod: d.paymentMethod, accountId: d.accountId, fundId: d.fundId, budgetId: d.budgetId, budgetItemId: d.budgetItemId, notes: d.notes,
  });
  const payFrom = (r: ExpenseRequestRow) => setForm({ kind: "pay", requestId: r.id, value: { description: r.description, amount: r.amount, category: r.category, vendor: r.vendorName, receiptUrl: r.attachmentUrl, accountId: r.accountId, budgetId: r.budget?.id ?? null, budgetItemId: r.budgetItem?.id ?? null } });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Expenses</h1>
          <p className="mt-1.5 text-sm text-ink-muted">What the church spent, with receipts, approvals and regular bills.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/export/transactions?${p.exportQs}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}><Download /> Export</a>
          <div className="relative">
            <Button variant="secondary" size="sm" onClick={() => setMenu((m) => !m)} aria-label="More"><MoreHorizontal /></Button>
            {menu && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-xl" onClick={() => setMenu(false)}>
                {p.canWrite && <button onClick={() => setForm({ kind: "request" })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><HandCoins className="size-4" /> Request money</button>}
                <a href={`/api/export/transactions?${p.exportQs}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><Download className="size-4" /> Export these records</a>
                <a href={`/api/export/expenses?format=xlsx`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><Download className="size-4" /> Export all, with details</a>
                {p.canWrite && p.me.isAdmin && <button onClick={() => setLimitOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"><Settings2 className="size-4" /> Approval limit{p.approvalOver ? ` (${money(p.approvalOver)})` : ""}</button>}
              </div>
            )}
          </div>
          {p.canWrite
            ? <Button size="sm" onClick={() => setForm({ kind: "record" })}><Plus /> Record expense</Button>
            : <Button size="sm" onClick={() => setForm({ kind: "request" })}><HandCoins /> Request money</Button>}
        </div>
      </div>

      {/* Needs you */}
      {(waiting.length > 0 || dueSoon.length > 0 || (p.missingReceipts > 0 && p.canWrite)) && (
        <div className="grid gap-3 md:grid-cols-3">
          {waiting.length > 0 && <WaitingBlock items={waiting} me={p.me} canWrite={p.canWrite} onOpen={() => setTab("approvals")} />}
          {dueSoon.length > 0 && <DueBlock items={dueSoon} canWrite={p.canWrite} onOpen={() => setTab("recurring")} />}
          {p.missingReceipts > 0 && p.canWrite && (
            <button onClick={() => { setTab("records"); nav.go({ filters: { receipt: "without" } }); }} className="card-surface flex items-start gap-3 p-4 text-left hover:border-primary/40">
              <ReceiptText className="mt-0.5 size-5 shrink-0 text-warning" />
              <span><span className="block text-sm font-semibold">{p.missingReceipts} expense{p.missingReceipts === 1 ? "" : "s"} with no receipt</span><span className="text-xs text-ink-muted">{p.ledger.label}. Tap to see them and add photos.</span></span>
            </button>
          )}
        </div>
      )}

      <PeriodBar ledger={p.ledger} />
      <Hero ledger={p.ledger} payees={p.payees} onCategory={(c) => { setTab("records"); nav.go({ filters: { category: p.ledger.filters.category === c ? "" : c } }); }} />

      {p.budgetsOn && p.budgets.length > 0 && <BudgetStrip budgets={p.budgets} />}

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {([["records", "Records"], ["approvals", `Approvals${waiting.length ? ` (${waiting.length})` : ""}`], ["recurring", "Regular payments"], ["summary", "Summary"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{label}</button>
        ))}
      </div>

      {tab === "records" && <Records ledger={p.ledger} details={p.details} accounts={p.accounts} budgets={p.budgets} budgetsOn={p.budgetsOn} payees={p.payees} onOpen={setOpenId} />}
      {tab === "approvals" && <ApprovalsPanel pending={p.pending} decided={p.decided} budgets={p.budgets} me={p.me} canWrite={p.canWrite} onPay={payFrom} />}
      {tab === "recurring" && <RecurringPanel items={p.recurring} lists={lists} canWrite={p.canWrite} canDelete={p.canDelete} />}
      {tab === "summary" && <Summary ledger={p.ledger} payees={p.payees} accounts={p.accounts} byMethod={p.byMethod} budgets={p.budgetsOn ? p.budgets : []} onOpen={() => setTab("records")} />}

      {open && (
        <ExpenseSheet d={open} accountName={p.accounts.find((a) => a.id === open.accountId)?.name ?? null} fundName={p.funds.find((f) => f.id === open.fundId)?.name ?? null}
          canWrite={p.canWrite} canDelete={p.canDelete} onClose={() => setOpenId(null)} onEdit={() => { setForm({ kind: "edit", value: toEdit(open) }); setOpenId(null); }} />
      )}
      {form && <ExpenseForm mode={form} lists={lists} approvalOver={p.approvalOver} isOwner={p.me.isOwner} onClose={() => setForm(null)} />}
      {limitOpen && <LimitSheet value={p.approvalOver} onClose={() => setLimitOpen(false)} />}
    </div>
  );
}

function WaitingBlock({ items, me, canWrite, onOpen }: { items: ExpenseRequestRow[]; me: { id: string; isOwner: boolean }; canWrite: boolean; onOpen: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const total = items.reduce((t, r) => t + r.amount, 0);
  const first = items.find((r) => r.status === "pending" && (r.requestedById !== me.id || me.isOwner));
  const approve = () => {
    if (!first) return;
    const fd = new FormData();
    fd.set("id", first.id);
    fd.set("decision", "approve");
    start(async () => { const r = await decideExpenseRequest(fd); if (r.ok) { toast("Approved", "success"); router.refresh(); } else toast(r.error ?? "Could not approve.", "error"); });
  };
  return (
    <div className="card-surface p-4">
      <button onClick={onOpen} className="block text-left">
        <span className="block text-sm font-semibold">{items.length} request{items.length === 1 ? "" : "s"} waiting · <span className="tabular-nums">{money(total)}</span></span>
        {first && <span className="text-xs text-ink-muted">{first.requestedByName ?? "Someone"}: {first.description}, {money(first.amount)}</span>}
      </button>
      {canWrite && first && (
        <div className="mt-2 flex gap-2">
          <BusyButton type="button" size="sm" busy={pending} busyLabel="Approving…" onClick={approve}><Check /> Approve</BusyButton>
          <Button size="sm" variant="ghost" onClick={onOpen}>Review</Button>
        </div>
      )}
    </div>
  );
}

function DueBlock({ items, canWrite, onOpen }: { items: Recurring[]; canWrite: boolean; onOpen: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const r = items[0];
  const record = () => {
    const fd = new FormData();
    fd.set("id", r.id);
    start(async () => { const x = await recordRecurringNow(fd); if (x.ok) { toast(`${r.description} recorded`, "success"); router.refresh(); } else toast(x.error ?? "Could not record it.", "error"); });
  };
  const d = daysUntil(r.nextDue);
  return (
    <div className="card-surface p-4">
      <button onClick={onOpen} className="flex items-start gap-3 text-left">
        <Repeat className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>
          <span className="block text-sm font-semibold">{r.description} {money(r.amount)} {d < 0 ? "was due" : "is due"} {fmtDate(r.nextDue, false)}</span>
          {items.length > 1 && <span className="text-xs text-ink-muted">and {items.length - 1} more regular payment{items.length === 2 ? "" : "s"} this week</span>}
        </span>
      </button>
      {canWrite && <BusyButton type="button" size="sm" className="mt-2" busy={pending} busyLabel="Recording…" onClick={record}>Record</BusyButton>}
    </div>
  );
}

function Hero({ ledger, payees, onCategory }: { ledger: Ledger; payees: { name: string; total: number; count: number }[]; onCategory: (c: string) => void }) {
  const nav = useLedgerNav(ledger);
  const spent = ledger.totals.expenses;
  const prev = ledger.previous;
  const delta = prev && prev.expenses > 0 ? Math.round(((spent - prev.expenses) / prev.expenses) * 100) : null;
  const cats = [...ledger.byCategory].filter((c) => c.expenses > 0).sort((a, b) => b.expenses - a.expenses);
  const top = cats.slice(0, 5);
  const rest = cats.slice(5).reduce((t, c) => t + c.expenses, 0);
  const segs = [...top.map((c) => ({ name: c.name, value: c.expenses })), ...(rest > 0 ? [{ name: "Other", value: rest }] : [])];
  const active = ledger.buckets.filter((b) => b.expenses > 0);
  const avg = active.length ? spent / active.length : 0;
  const week = ledger.bucketKind === "week";
  const biggest = payees[0];
  return (
    <Card className={cn("p-5 transition-opacity", nav.pending && "opacity-60")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Spent in {ledger.label}</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-tight tabular-nums">{money(spent, true)}</p>
        </div>
        {delta != null && prev && (
          <p className={cn("text-sm font-medium", delta <= 0 ? "text-success" : "text-warning")}>
            {delta === 0 ? "Same as" : `${Math.abs(delta)}% ${delta > 0 ? "more than" : "less than"}`} {prev.label}
          </p>
        )}
      </div>
      {segs.length > 0 && (
        <>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Spending by category">
            {segs.map((s, i) => (
              <button key={s.name} title={`${s.name}: ${money(s.value)}`} onClick={() => s.name !== "Other" && onCategory(s.name)} style={{ width: `${(s.value / spent) * 100}%`, background: SEG[i] }} className="h-full border-r-2 border-surface last:border-r-0" />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {segs.map((s, i) => (
              <li key={s.name}>
                <button onClick={() => s.name !== "Other" && onCategory(s.name)} className={cn("inline-flex items-center gap-1.5", ledger.filters.category === s.name ? "font-semibold text-primary" : "text-ink-muted hover:text-ink")}>
                  <span className="size-2 rounded-sm" style={{ background: SEG[i] }} aria-hidden /> {s.name} <span className="tabular-nums text-ink">{money(s.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 border-t border-line-soft pt-3 text-xs text-ink-muted">
        {ledger.totals.count.toLocaleString("en-GB")} record{ledger.totals.count === 1 ? "" : "s"}
        {active.length > 1 && <> · average {money(avg)} a {week ? "week" : "month"}</>}
        {biggest && biggest.total > 0 && <> · biggest payee: {biggest.name} {money(biggest.total)}</>}
      </p>
    </Card>
  );
}

function BudgetStrip({ budgets }: { budgets: BudgetUse[] }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Budgets this year</p>
      <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {budgets.slice(0, 6).map((b) => {
          const pct = b.allocated > 0 ? Math.min(100, (b.used / b.allocated) * 100) : 0;
          const over = b.allocated > 0 && b.used > b.allocated;
          return (
            <li key={b.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{b.name}</span>
                <span className={cn("shrink-0 text-xs tabular-nums", over ? "font-semibold text-warning" : "text-ink-muted")}>{over && "Over · "}{money(b.used)} of {money(b.allocated)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full", over ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Records({ ledger, details, accounts, budgets, budgetsOn, payees, onOpen }: {
  ledger: Ledger; details: Record<string, ExpenseDetail>; accounts: { id: string; name: string }[]; budgets: BudgetUse[]; budgetsOn: boolean;
  payees: { name: string }[]; onOpen: (id: string) => void;
}) {
  const nav = useLedgerNav(ledger);
  const f = ledger.filters;
  const [q, setQ] = useState(f.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the box in step when the filters are cleared from elsewhere.
  const [seenQ, setSeenQ] = useState(f.q);
  if (seenQ !== f.q) { setSeenQ(f.q); setQ(f.q); }
  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => nav.go({ filters: { q: v.trim() } }), 400);
  };
  const { rows, pageInfo } = ledger;
  const heads = dayHeadings(rows, f.sort !== "largest");
  const acct = (id: string | null) => accounts.find((a) => a.id === id)?.name;
  const sel = "h-9 w-auto py-0 text-xs";
  const clear = () => nav.go({ filters: { account: "", category: "", q: "", method: "", receipt: "", budget: "", payee: "" } });

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative min-w-0 flex-1 basis-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search what, payee or category" className="h-9 pl-9" aria-label="Search expenses" />
        </div>
        <Select className={sel} value={f.category} onChange={(v) => nav.go({ filters: { category: v } })} options={[{ value: "", label: "Any category" }, ...ledger.options.categories.map((c) => ({ value: c, label: c }))]} />
        {accounts.length > 0 && <Select className={sel} value={f.account} onChange={(v) => nav.go({ filters: { account: v } })} options={[{ value: "", label: "Any account" }, ...accounts.map((a) => ({ value: a.id, label: a.name })), { value: "none", label: "No account" }]} />}
        <Select className={sel} value={f.method ?? ""} onChange={(v) => nav.go({ filters: { method: v } })} options={[{ value: "", label: "Any method" }, ...PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label })), { value: "none", label: "Not recorded" }]} />
        {payees.length > 0 && <Select className={sel} value={f.payee ?? ""} onChange={(v) => nav.go({ filters: { payee: v } })} options={[{ value: "", label: "Any payee" }, ...payees.map((x) => ({ value: x.name, label: x.name }))]} />}
        {budgetsOn && budgets.length > 0 && <Select className={sel} value={f.budget ?? ""} onChange={(v) => nav.go({ filters: { budget: v } })} options={[{ value: "", label: "Any budget" }, ...budgets.map((b) => ({ value: b.id, label: b.name })), { value: "none", label: "No budget" }]} />}
        <Select className={sel} value={f.receipt ?? ""} onChange={(v) => nav.go({ filters: { receipt: v as "" | "with" | "without" } })} options={[{ value: "", label: "Receipt: any" }, { value: "with", label: "With receipt" }, { value: "without", label: "No receipt" }]} />
        <Select className={sel} value={f.sort} onChange={(v) => nav.go({ filters: { sort: v as typeof f.sort } })} options={[{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "largest", label: "Largest" }]} />
        {nav.pending && <Spinner size="sm" className="text-primary" />}
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-xs text-ink-muted">
        <span>{pageInfo.total === 0 ? "Nothing matches" : `${pageInfo.total.toLocaleString("en-GB")} record${pageInfo.total === 1 ? "" : "s"}`}{ledger.activeFilters > 0 ? " with your filters" : ` · ${ledger.label}`}</span>
        {ledger.activeFilters > 0 && <button onClick={clear} className="font-medium text-primary hover:underline">Clear filters</button>}
      </div>

      <div className={cn("transition-opacity", nav.pending && "opacity-50")}>
        {rows.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-14 text-center text-sm text-ink-muted"><Inbox className="size-8 text-ink-faint" />{ledger.activeFilters > 0 ? "No expenses match." : "No expenses recorded in this period."}</div>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-y border-line bg-surface-2/50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                <tr><th className="px-4 py-2">What</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Paid</th><th className="w-8 px-1 py-2"><span className="sr-only">Receipt</span></th><th className="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const d = details[r.id];
                  return (
                    <FragmentRow key={r.id} heading={heads[i]}>
                      <tr onClick={() => d && onOpen(r.id)} className="cursor-pointer border-b border-line-soft hover:bg-surface-2/40">
                        <td className="px-4 py-2.5"><span className="font-medium">{d?.description ?? r.description}</span>{d?.vendor && <span className="block text-xs text-ink-muted">{d.vendor}</span>}</td>
                        <td className="px-3 py-2.5 text-ink-muted">{r.category}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-muted">{methodLabel(r.meta?.paymentMethod)}{acct(r.accountId) && <span className="block">{acct(r.accountId)}</span>}</td>
                        <td className="px-1 py-2.5 text-ink-faint">{r.meta?.hasReceipt && <Paperclip className="size-3.5" aria-label="Has a receipt" />}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(-r.amount, true)}</td>
                      </tr>
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
            <ul className="md:hidden">
              {rows.map((r, i) => {
                const d = details[r.id];
                return (
                  <li key={r.id}>
                    {heads[i] && <div className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{heads[i]}</div>}
                    <button onClick={() => d && onOpen(r.id)} className="flex w-full items-center gap-3 border-b border-line-soft px-4 py-3 text-left active:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d?.description ?? r.description}</span>
                        <span className="block truncate text-xs text-ink-muted">{[d?.vendor, r.category, r.meta?.paymentMethod ? methodLabel(r.meta.paymentMethod) : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      {r.meta?.hasReceipt && <Paperclip className="size-3.5 shrink-0 text-ink-faint" />}
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(-r.amount, true)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {pageInfo.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink-faint">{(pageInfo.page - 1) * pageInfo.pageSize + 1}-{Math.min(pageInfo.total, pageInfo.page * pageInfo.pageSize)} of {pageInfo.total.toLocaleString("en-GB")}</span>
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

function FragmentRow({ heading, children }: { heading: string | null; children: React.ReactNode }) {
  return (
    <>
      {heading && <tr><td colSpan={5} className="bg-surface-2/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{heading}</td></tr>}
      {children}
    </>
  );
}

function Summary({ ledger, payees, accounts, byMethod, budgets, onOpen }: {
  ledger: Ledger; payees: { name: string; total: number; count: number }[]; accounts: { id: string; name: string }[];
  byMethod: { method: string | null; total: number; count: number }[]; budgets: BudgetUse[]; onOpen: () => void;
}) {
  const nav = useLedgerNav(ledger);
  const week = ledger.bucketKind === "week";
  const max = Math.max(1, ...ledger.buckets.map((b) => b.expenses));
  const acct = ledger.byAccount.filter((a) => a.expenses > 0);
  const methodMax = Math.max(1, ...byMethod.map((m) => m.total));
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
                <div className="w-28 shrink-0"><div className="text-sm font-medium">{week ? b.label : b.sub}</div><div className="text-xs text-ink-faint">{week ? b.sub : b.label.split(" ")[1]}</div></div>
                <div className="hidden h-2 flex-1 overflow-hidden rounded-full bg-surface-2 sm:block"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(b.expenses / max) * 100}%` }} /></div>
                <div className="ml-auto w-28 text-right text-sm font-semibold tabular-nums">{b.expenses ? money(b.expenses) : <span className="text-ink-faint">-</span>}</div>
                <div className="w-14 text-right">{b.expenses > 0 && <button onClick={() => { nav.go({ period: { kind: "custom", from: b.from, to: b.to } }); onOpen(); }} className="text-xs font-medium text-primary hover:underline">View</button>}</div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-surface-2/40 px-5 py-3 text-sm font-semibold"><span>Total</span><span className="tabular-nums">{money(ledger.totals.expenses)}</span></div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="By category" subtitle="Where the money went" items={ledger.byCategory} side="expenses" empty="No spending in this period." />
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">Top payees</h3>
          <p className="text-xs text-ink-muted">Who was paid the most</p>
          {payees.length === 0 ? <p className="mt-4 text-sm text-ink-faint">No payees recorded. Choose a payee when you record an expense.</p> : (
            <ul className="mt-3 divide-y divide-line-soft">
              {payees.map((x) => <li key={x.name} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0 truncate font-medium">{x.name}<span className="ml-1.5 text-xs font-normal text-ink-faint">{x.count}x</span></span><span className="shrink-0 tabular-nums">{money(x.total)}</span></li>)}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-[1rem] font-semibold">By payment method</h3>
          <ul className="mt-3 space-y-2.5">
            {byMethod.map((m) => (
              <li key={m.method ?? "none"}>
                <div className="flex justify-between text-sm"><span>{methodLabel(m.method)}<span className="ml-1.5 text-xs text-ink-faint">{m.count}x</span></span><span className="tabular-nums">{money(m.total)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(m.total / methodMax) * 100}%` }} /></div>
              </li>
            ))}
            {byMethod.length === 0 && <li className="text-sm text-ink-faint">Nothing in this period.</li>}
          </ul>
        </Card>
        {acct.length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-[1rem] font-semibold">Paid from</h3>
            <ul className="mt-3 divide-y divide-line-soft">
              {acct.map((a) => <li key={a.accountId ?? "none"} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium">{accounts.find((x) => x.id === a.accountId)?.name ?? "No account"}</span><span className="tabular-nums">{money(a.expenses)}</span></li>)}
            </ul>
          </Card>
        )}
        {budgets.length > 0 && (
          <Card className="p-5">
            <h3 className="font-display text-[1rem] font-semibold">By budget (this year)</h3>
            <ul className="mt-3 divide-y divide-line-soft">
              {budgets.map((b) => <li key={b.id} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium">{b.name}</span><span className={cn("tabular-nums", b.used > b.allocated && b.allocated > 0 && "text-warning")}>{money(b.used)} of {money(b.allocated)}</span></li>)}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function LimitSheet({ value, onClose }: { value: number | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const submit = (fd: FormData) => {
    setError("");
    start(async () => {
      const r = await setApprovalThreshold(fd);
      if (r.ok) { toast("Approval limit saved", "success"); router.refresh(); onClose(); } else setError(r.error ?? "That did not save.");
    });
  };
  return (
    <Sheet open onClose={onClose} busy={pending} title="Approval limit" description="Expenses above this amount go for approval first. The Main Admin's own expenses never wait.">
      <form action={submit} className="space-y-4">
        <F label="Needs approval above (₵)" htmlFor="lim" hint="Leave empty to switch approvals off"><Input id="lim" name="amount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={value ?? ""} /></F>
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Save</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
