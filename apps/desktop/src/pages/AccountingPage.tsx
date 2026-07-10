import { useEffect, useMemo, useState } from "react";
import {
  Plus, Loader2, Wallet, TrendingUp, TrendingDown, Scale,
  Pencil, Trash2, ChevronLeft, ChevronRight, Layers, Download,
  Building2, Settings2, ArrowRightLeft, Landmark, Smartphone, Banknote,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn, safeNum } from "../lib/utils";
import { v4 as uuid } from "uuid";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank Account", icon: Landmark },
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "mobile_money", label: "Mobile Money", icon: Smartphone },
];

function cedis(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return "₵" + (isNaN(v) ? 0 : v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Row {
  id: string;
  description: string;
  category: string;
  fund: string;
  accountId: string | null;
  amount: number;
  date: string;
  source: "manual" | "giving";
}

export function AccountingPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [txns, setTxns] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [showRoutingModal, setShowRoutingModal] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [allTime, setAllTime] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [t, g, f, a] = await Promise.all([
      db.rawQuery("SELECT * FROM \"transaction\" WHERE church_id = ? ORDER BY date DESC", [cid]),
      db.rawQuery("SELECT * FROM gift WHERE church_id = ? ORDER BY date DESC", [cid]),
      db.rawQuery("SELECT * FROM fund WHERE church_id = ?", [cid]),
      db.rawQuery("SELECT * FROM church_account WHERE church_id = ? ORDER BY is_default DESC, name ASC", [cid]),
    ]);
    setTxns(t);
    setGifts(g);
    setFunds(f);
    setAccounts(a);
    setLoading(false);
  }

  const fundName = (id: string | null) => funds.find((f) => f.id === id)?.name || "General";
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name || null;
  const fundAccountId = (fundId: string | null) => funds.find((f) => f.id === fundId)?.account_id || null;

  const { rows, income, expenses, byFund, weeks } = useMemo(() => {
    const inPeriod = (dateStr: string) => {
      if (allTime) return true;
      const d = new Date(dateStr);
      return d.getFullYear() === year && d.getMonth() === month;
    };

    const manualRows: Row[] = txns
      .filter((t) => inPeriod(t.date))
      .map((t) => ({
        id: t.id, description: t.description, category: t.category,
        fund: t.fund || "General", accountId: t.account_id || null,
        amount: safeNum(t.amount), date: t.date, source: "manual" as const,
      }));

    const givingRows: Row[] = gifts
      .filter((g) => inPeriod(g.date))
      .map((g) => ({
        id: g.id, description: `${g.donor_name || "Anonymous"} — ${fundName(g.fund_id)}`,
        category: fundName(g.fund_id), fund: fundName(g.fund_id),
        accountId: fundAccountId(g.fund_id),
        amount: safeNum(g.amount), date: g.date, source: "giving" as const,
      }));

    let all = [...manualRows, ...givingRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (activeAccountId) {
      all = all.filter((r) => r.accountId === activeAccountId);
    }

    let inc = 0, exp = 0;
    const fundMap = new Map<string, number>();
    for (const r of all) {
      if (r.amount >= 0) inc += r.amount;
      else exp += Math.abs(r.amount);
      fundMap.set(r.fund, (fundMap.get(r.fund) ?? 0) + r.amount);
    }

    const weekList: { label: string; income: number; expenses: number; count: number }[] = [];
    if (!allTime) {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      let cursor = new Date(first);
      let wi = 1;
      while (cursor <= last) {
        const wStart = new Date(cursor);
        const wEnd = new Date(cursor);
        wEnd.setDate(wEnd.getDate() + 6);
        if (wEnd > last) wEnd.setTime(last.getTime());
        const wRows = all.filter((r) => {
          const d = new Date(r.date);
          return d >= wStart && d <= new Date(wEnd.getFullYear(), wEnd.getMonth(), wEnd.getDate(), 23, 59, 59);
        });
        weekList.push({
          label: `Week ${wi} · ${wStart.getDate()}–${wEnd.getDate()}`,
          income: wRows.filter((r) => r.amount >= 0).reduce((s, r) => s + r.amount, 0),
          expenses: wRows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0),
          count: wRows.length,
        });
        cursor.setDate(cursor.getDate() + 7);
        wi++;
      }
    }

    return {
      rows: all, income: inc, expenses: exp,
      byFund: Array.from(fundMap.entries()).sort((a, b) => b[1] - a[1]),
      weeks: weekList,
    };
  }, [txns, gifts, funds, year, month, allTime, activeAccountId, accounts]);

  const net = income - expenses;

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  function handleDelete(row: Row) {
    if (row.source !== "manual") {
      showToast("Giving entries are managed on the Giving page");
      return;
    }
    const key = `${row.source}-${row.id}`;
    if (confirmDeleteId === key) {
      if (confirmTimerRef[0]) clearTimeout(confirmTimerRef[0]);
      confirmTimerRef[0] = null;
      setConfirmDeleteId(null);
      setTxns((prev) => prev.filter((t) => t.id !== row.id));
      showToast("Transaction deleted");
      db.delete("transaction", row.id);
    } else {
      if (confirmTimerRef[0]) clearTimeout(confirmTimerRef[0]);
      setConfirmDeleteId(key);
      confirmTimerRef[0] = setTimeout(() => {
        setConfirmDeleteId(null);
        confirmTimerRef[0] = null;
      }, 3000);
    }
  }

  async function handleDeleteAccount(id: string) {
    await db.delete("church_account", id);
    showToast("Account deleted");
    loadData();
  }

  return (
    <PageShell title="Accounting">
      <PageHeader
        title="Accounting"
        description="Income, expenses and fund balances. Create multiple accounts and route funds to them."
      >
        <button onClick={() => setShowRoutingModal(true)} className="btn-ghost btn-sm" title="Fund routing">
          <ArrowRightLeft className="size-3.5" /> Routing
        </button>
        <button onClick={() => {
          const headers = ["Date", "Description", "Category", "Fund", "Account", "Amount", "Source"];
          const csvRows = rows.map((r) => [
            new Date(r.date).toLocaleDateString(), r.description, r.category, r.fund,
            accountName(r.accountId) || "—", String(r.amount), r.source,
          ]);
          const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url;
          a.download = `accounting-${allTime ? "all" : `${year}-${String(month + 1).padStart(2, "0")}`}.csv`;
          a.click(); URL.revokeObjectURL(url);
          showToast("CSV exported");
        }} className="btn-secondary btn-sm">
          <Download className="size-3.5" /> Export CSV
        </button>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Transaction
        </button>
      </PageHeader>

      {/* Account tabs */}
      {accounts.length > 0 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveAccountId(null)}
            className={cn("btn-sm whitespace-nowrap", !activeAccountId ? "btn-primary" : "btn-ghost")}
          >
            All Accounts
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAccountId(a.id === activeAccountId ? null : a.id)}
              className={cn("btn-sm whitespace-nowrap", activeAccountId === a.id ? "btn-primary" : "btn-ghost")}
            >
              {a.is_default ? "⭐ " : ""}{a.name}
            </button>
          ))}
          <button
            onClick={() => { setEditingAccount(null); setShowAccountModal(true); }}
            className="btn-ghost btn-sm text-primary-bright"
          >
            <Plus className="size-3.5" /> Add Account
          </button>
        </div>
      )}

      {/* Period controls */}
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setAllTime((v) => !v)}
          className={cn("btn-sm", allTime ? "btn-primary" : "btn-ghost")}>
          {allTime ? "All time" : "Monthly"}
        </button>
        {!allTime && (
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"><ChevronLeft className="size-4" /></button>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input h-8 w-auto px-2 text-sm font-bold text-ink">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input h-8 w-auto px-2 text-sm font-bold text-ink">
              {Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={nextMonth} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"><ChevronRight className="size-4" /></button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-primary-bright whq-spin" />
        </div>
      ) : (
        <>
          {/* Account summary cards */}
          {accounts.length > 0 && !activeAccountId && (
            <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {accounts.map((a) => {
                const acctRows = rows.filter(() => true); // full rows already filtered
                const acctIncome = txns.filter((t) => t.account_id === a.id).reduce((s, t) => { const v = safeNum(t.amount); return v >= 0 ? s + v : s; }, 0)
                  + gifts.filter((g) => fundAccountId(g.fund_id) === a.id).reduce((s, g) => s + safeNum(g.amount), 0);
                const acctExpense = txns.filter((t) => t.account_id === a.id).reduce((s, t) => { const v = safeNum(t.amount); return v < 0 ? s + Math.abs(v) : s; }, 0);
                const acctNet = acctIncome - acctExpense;
                const TypeIcon = ACCOUNT_TYPES.find((t) => t.value === a.type)?.icon || Wallet;
                return (
                  <button
                    key={a.id}
                    onClick={() => setActiveAccountId(a.id)}
                    className="card p-4 text-left hover:border-primary/30 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <TypeIcon className="size-4 text-primary-bright" />
                      <span className="text-xs font-bold text-ink truncate">{a.name}</span>
                      {a.is_default ? <span className="badge badge-primary text-[9px]">Default</span> : null}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingAccount(a); setShowAccountModal(true); }}
                        className="ml-auto opacity-0 group-hover:opacity-100 grid size-6 place-items-center rounded text-ink-faint hover:text-primary-bright"
                      >
                        <Settings2 className="size-3" />
                      </button>
                    </div>
                    <div className={cn("text-lg font-bold tabular-nums", acctNet >= 0 ? "text-success" : "text-danger")}>
                      {cedis(acctNet)}
                    </div>
                    <div className="flex gap-2 mt-1 text-[11px]">
                      <span className="text-success">+{cedis(acctIncome)}</span>
                      <span className="text-danger">−{cedis(acctExpense)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Income" value={cedis(income)} icon={TrendingUp} color="text-success" />
            <StatCard label="Expenses" value={cedis(expenses)} icon={TrendingDown} color="text-danger" />
            <StatCard label={net >= 0 ? "Surplus" : "Deficit"} value={cedis(Math.abs(net))} icon={Scale} color={net >= 0 ? "bg-primary-soft text-primary-bright" : "bg-gold/10 text-gold"} />
            <StatCard label="Entries" value={rows.length} icon={Layers} color="text-info" />
          </div>

          {/* No accounts hint */}
          {accounts.length === 0 && (
            <div className="mb-5 card p-4 border-primary/20 bg-primary-soft/30">
              <div className="flex items-center gap-3">
                <Building2 className="size-5 text-primary-bright flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">Set up multiple accounts</p>
                  <p className="text-xs text-ink-muted">Create accounts like &quot;Main Account&quot; and &quot;Building Fund&quot; to track where money goes. Route different funds to different accounts.</p>
                </div>
                <button onClick={() => { setEditingAccount(null); setShowAccountModal(true); }} className="btn-primary btn-sm whitespace-nowrap">
                  <Plus className="size-3.5" /> Create Account
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {/* Ledger */}
            <div className="col-span-2">
              <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">
                Ledger {activeAccountId && <span className="text-primary-bright">· {accountName(activeAccountId)}</span>}
              </h3>
              {rows.length === 0 ? (
                <div className="card py-10 text-center">
                  <Wallet className="mx-auto size-8 text-ink-faint/30" />
                  <p className="mt-2 text-sm text-ink-muted">No transactions for this period</p>
                </div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface-2/50">
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Description</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Fund</th>
                        {accounts.length > 0 && <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Account</th>}
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Amount</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {rows.map((r) => (
                        <tr key={`${r.source}-${r.id}`} className="hover:bg-surface-2/50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-ink">{r.description}</div>
                            <div className="text-[11px] text-ink-faint">
                              {new Date(r.date).toLocaleDateString()} · {r.category}
                              {r.source === "giving" && <span className="ml-1 rounded bg-primary-soft px-1 text-primary-bright">giving</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{r.fund}</td>
                          {accounts.length > 0 && (
                            <td className="px-3 py-2 text-xs text-ink-faint">{accountName(r.accountId) || "—"}</td>
                          )}
                          <td className={cn("px-3 py-2 text-right font-bold tabular-nums", r.amount >= 0 ? "text-success" : "text-danger")}>
                            {r.amount >= 0 ? "+" : "−"}{cedis(Math.abs(r.amount))}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              {r.source === "manual" ? (
                                <>
                                  <button onClick={() => { setEditing(txns.find((t) => t.id === r.id)); setShowForm(true); }}
                                    className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit">
                                    <Pencil className="size-3.5" />
                                  </button>
                                  {confirmDeleteId === `${r.source}-${r.id}` ? (
                                    <button onClick={() => handleDelete(r)}
                                      className="rounded-lg bg-danger px-2 py-1 text-[11px] font-bold text-white animate-pulse" title="Click again to confirm">
                                      Confirm?
                                    </button>
                                  ) : (
                                    <button onClick={() => handleDelete(r)}
                                      className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete">
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[11px] text-ink-faint/60">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Fund balances + weekly */}
            <div className="space-y-5">
              <div>
                <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Fund Balances</h3>
                <div className="card p-4 space-y-2">
                  {byFund.length === 0 ? (
                    <p className="text-sm text-ink-muted">No funds yet</p>
                  ) : byFund.map(([name, bal]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-sm text-ink">{name}</span>
                      <span className={cn("text-sm font-bold tabular-nums", bal >= 0 ? "text-ink" : "text-danger")}>{cedis(bal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!allTime && weeks.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Weekly</h3>
                  <div className="card p-4 space-y-3">
                    {weeks.map((w) => (
                      <div key={w.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">{w.label}</span>
                          <span className="text-ink-faint">{w.count} entr{w.count === 1 ? "y" : "ies"}</span>
                        </div>
                        <div className="mt-1 flex gap-3 text-[11px]">
                          <span className="text-success">+{cedis(w.income)}</span>
                          <span className="text-danger">−{cedis(w.expenses)}</span>
                          <span className={cn("font-semibold", w.income - w.expenses >= 0 ? "text-ink" : "text-danger")}>
                            net {cedis(w.income - w.expenses)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Transaction form modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Transaction" : "Record Transaction"}>
        <TxnForm
          churchId={session!.churchId}
          existing={editing}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }}
        />
      </Modal>

      {/* Account form modal */}
      <Modal open={showAccountModal} onClose={() => { setShowAccountModal(false); setEditingAccount(null); }} title={editingAccount ? "Edit Account" : "Create Account"}>
        <AccountForm
          churchId={session!.churchId}
          existing={editingAccount}
          onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
          onSaved={() => { setShowAccountModal(false); setEditingAccount(null); loadData(); }}
          onDelete={editingAccount ? () => { handleDeleteAccount(editingAccount.id); setShowAccountModal(false); setEditingAccount(null); } : undefined}
        />
      </Modal>

      {/* Fund routing modal */}
      <Modal open={showRoutingModal} onClose={() => setShowRoutingModal(false)} title="Fund → Account Routing">
        <FundRoutingForm
          churchId={session!.churchId}
          funds={funds}
          accounts={accounts}
          onClose={() => setShowRoutingModal(false)}
          onSaved={() => { setShowRoutingModal(false); loadData(); }}
        />
      </Modal>
    </PageShell>
  );
}

/* ── Transaction form ── */
function TxnForm({ churchId, existing, accounts, onClose, onSaved }: {
  churchId: string; existing?: any; accounts: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const initType = existing ? (safeNum(existing.amount) < 0 ? "Expense" : "Income") : "Income";
  const [form, setForm] = useState({
    description: existing?.description || "",
    type: initType,
    amount: existing ? String(Math.abs(safeNum(existing.amount))) : "",
    category: existing?.category || "General",
    fund: existing?.fund || "General",
    account_id: existing?.account_id || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return;
    setSaving(true);
    const raw = Math.abs(safeNum(form.amount));
    const amount = form.type === "Expense" ? -raw : raw;
    const data = {
      description: form.description.trim(),
      category: form.category.trim() || "General",
      fund: form.fund.trim() || "General",
      account_id: form.account_id || null,
      amount,
    };
    if (existing) {
      await db.update("transaction", existing.id, data);
      showToast("Transaction updated");
    } else {
      await db.insert("transaction", { id: uuid(), church_id: churchId, ...data, date: new Date().toISOString() });
      showToast("Transaction recorded");
    }
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Description *</label>
        <input value={form.description} onChange={set("description")} className="input" placeholder="Sunday offering deposit" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">
            <option>Income</option>
            <option>Expense</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Amount (₵) *</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={set("amount")} className="input" placeholder="0.00" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Category</label>
          <input value={form.category} onChange={set("category")} className="input" placeholder="Offering / Utilities" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Fund</label>
          <input value={form.fund} onChange={set("fund")} className="input" placeholder="General" />
        </div>
      </div>
      {accounts.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Account</label>
          <select value={form.account_id} onChange={set("account_id")} className="input">
            <option value="">— No account —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_default ? " (default)" : ""}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : existing ? "Update" : "Save Transaction"}
        </button>
      </div>
    </form>
  );
}

/* ── Account form ── */
function AccountForm({ churchId, existing, onClose, onSaved, onDelete }: {
  churchId: string; existing?: any; onClose: () => void; onSaved: () => void; onDelete?: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: existing?.name || "",
    type: existing?.type || "bank",
    bank_name: existing?.bank_name || "",
    account_number: existing?.account_number || "",
    is_default: existing?.is_default ? true : false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const data = {
      name: form.name.trim(),
      type: form.type,
      bank_name: form.bank_name.trim() || null,
      account_number: form.account_number.trim() || null,
      is_default: form.is_default ? 1 : 0,
    };
    if (form.is_default) {
      // Per-row updates so each change is written to the sync change log
      // (rawQuery bypasses it and the reset would never reach the server).
      const others = await db.rawQuery(
        "SELECT id FROM church_account WHERE church_id = ? AND is_default = 1",
        [churchId],
      );
      for (const row of others) {
        await db.update("church_account", row.id, { is_default: 0 });
      }
    }
    if (existing) {
      await db.update("church_account", existing.id, data);
      showToast("Account updated");
    } else {
      await db.insert("church_account", { id: uuid(), church_id: churchId, ...data });
      showToast("Account created");
    }
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Account Name *</label>
        <input value={form.name} onChange={set("name")} className="input" placeholder="e.g. Main Account, Building Fund" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Account Type</label>
        <div className="grid grid-cols-3 gap-2">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t.value }))}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-3 text-sm transition-all",
                form.type === t.value
                  ? "border-primary bg-primary-soft text-primary-bright font-medium"
                  : "border-line hover:border-ink-faint text-ink-muted"
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {form.type === "bank" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Bank Name</label>
            <input value={form.bank_name} onChange={set("bank_name")} className="input" placeholder="e.g. GCB Bank" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Account Number</label>
            <input value={form.account_number} onChange={set("account_number")} className="input" placeholder="1234567890" />
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
          className="size-4 rounded border-line accent-primary"
        />
        <span className="text-sm text-ink">Set as default account</span>
      </label>
      <div className="flex gap-2 pt-2">
        {onDelete && (
          <button type="button" onClick={onDelete} className="btn-danger btn-sm">
            <Trash2 className="size-3.5" /> Delete
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : existing ? "Update" : "Create Account"}
        </button>
      </div>
    </form>
  );
}

/* ── Fund routing form ── */
function FundRoutingForm({ churchId, funds, accounts, onClose, onSaved }: {
  churchId: string; funds: any[]; accounts: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    for (const f of funds) {
      r[f.id] = f.account_id || "";
    }
    return r;
  });

  async function handleSave() {
    setSaving(true);
    for (const f of funds) {
      const newAccountId = routing[f.id] || null;
      if ((f.account_id || null) !== newAccountId) {
        await db.update("fund", f.id, { account_id: newAccountId });
      }
    }
    setSaving(false);
    showToast("Fund routing updated");
    onSaved();
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-6">
        <Building2 className="mx-auto size-8 text-ink-faint/30" />
        <p className="mt-2 text-sm text-ink-muted">Create at least one account first to set up fund routing.</p>
        <button onClick={onClose} className="btn-ghost mt-3">Close</button>
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <div className="text-center py-6">
        <Wallet className="mx-auto size-8 text-ink-faint/30" />
        <p className="mt-2 text-sm text-ink-muted">No funds created yet. Record some giving first — funds are created automatically.</p>
        <button onClick={onClose} className="btn-ghost mt-3">Close</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Choose which account each fund&apos;s income goes to. For example, route &quot;Harvest&quot; and &quot;Day Born&quot; to your Building Fund account.</p>
      <div className="space-y-3">
        {funds.map((f) => (
          <div key={f.id} className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <div className="size-3 rounded-full" style={{ background: f.color || "#6D5EF8" }} />
              <span className="text-sm font-medium text-ink">{f.name}</span>
            </div>
            <ArrowRightLeft className="size-3.5 text-ink-faint flex-shrink-0" />
            <select
              value={routing[f.id] || ""}
              onChange={(e) => setRouting((r) => ({ ...r, [f.id]: e.target.value }))}
              className="input h-8 w-48 text-sm"
            >
              <option value="">— No account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : "Save Routing"}
        </button>
      </div>
    </div>
  );
}
