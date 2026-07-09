import { useEffect, useMemo, useState } from "react";
import {
  Plus, Loader2, Wallet, TrendingUp, TrendingDown, Scale,
  Pencil, Trash2, ChevronLeft, ChevronRight, Layers, Download,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function cedis(n: number) {
  return "₵" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Row {
  id: string;
  description: string;
  category: string;
  fund: string;
  amount: number;
  date: string;
  source: "manual" | "giving";
}

export function AccountingPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [txns, setTxns] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

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
    const [t, g, f] = await Promise.all([
      db.rawQuery("SELECT * FROM \"transaction\" WHERE church_id = ? ORDER BY date DESC", [cid]),
      db.rawQuery("SELECT * FROM gift WHERE church_id = ? ORDER BY date DESC", [cid]),
      db.rawQuery("SELECT * FROM fund WHERE church_id = ?", [cid]),
    ]);
    setTxns(t);
    setGifts(g);
    setFunds(f);
    setLoading(false);
  }

  const fundName = (id: string | null) => funds.find((f) => f.id === id)?.name || "General";

  // Build combined ledger for the selected period
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
        fund: t.fund || "General", amount: Number(t.amount), date: t.date, source: "manual" as const,
      }));

    const givingRows: Row[] = gifts
      .filter((g) => inPeriod(g.date))
      .map((g) => ({
        id: g.id, description: `${g.donor_name || "Anonymous"} — ${fundName(g.fund_id)}`,
        category: fundName(g.fund_id), fund: fundName(g.fund_id),
        amount: Number(g.amount), date: g.date, source: "giving" as const,
      }));

    const all = [...manualRows, ...givingRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    let inc = 0, exp = 0;
    const fundMap = new Map<string, number>();
    for (const r of all) {
      if (r.amount >= 0) inc += r.amount;
      else exp += Math.abs(r.amount);
      fundMap.set(r.fund, (fundMap.get(r.fund) ?? 0) + r.amount);
    }

    // Weekly breakdown (only meaningful for a single month)
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
  }, [txns, gifts, funds, year, month, allTime]);

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
      // Second click — actually delete
      if (confirmTimerRef[0]) clearTimeout(confirmTimerRef[0]);
      confirmTimerRef[0] = null;
      setConfirmDeleteId(null);
      setTxns((prev) => prev.filter((t) => t.id !== row.id));
      showToast("Transaction deleted");
      db.delete("transaction", row.id);
    } else {
      // First click — enter confirm state
      if (confirmTimerRef[0]) clearTimeout(confirmTimerRef[0]);
      setConfirmDeleteId(key);
      confirmTimerRef[0] = setTimeout(() => {
        setConfirmDeleteId(null);
        confirmTimerRef[0] = null;
      }, 3000);
    }
  }

  return (
    <PageShell title="Accounting">
      <PageHeader
        title="Accounting"
        description="Income, expenses and fund balances in ₵. Categories classify the type (Offering, Tithe, Rent); Funds track which pot of money (General, Building, Missions)."
      >
        <button onClick={() => {
          const headers = ["Date", "Description", "Category", "Fund", "Amount", "Source"];
          const csvRows = rows.map((r) => [
            new Date(r.date).toLocaleDateString(), r.description, r.category, r.fund,
            String(r.amount), r.source,
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
          <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Income" value={cedis(income)} icon={TrendingUp} color="text-success" />
            <StatCard label="Expenses" value={cedis(expenses)} icon={TrendingDown} color="text-danger" />
            <StatCard label={net >= 0 ? "Surplus" : "Deficit"} value={cedis(Math.abs(net))} icon={Scale} color={net >= 0 ? "bg-primary-soft text-primary-bright" : "bg-gold/10 text-gold"} />
            <StatCard label="Entries" value={rows.length} icon={Layers} color="text-info" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Ledger */}
            <div className="col-span-2">
              <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Ledger</h3>
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

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Transaction" : "Record Transaction"}>
        <TxnForm
          churchId={session!.churchId}
          existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }}
        />
      </Modal>
    </PageShell>
  );
}

function TxnForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const initType = existing ? (Number(existing.amount) < 0 ? "Expense" : "Income") : "Income";
  const [form, setForm] = useState({
    description: existing?.description || "",
    type: initType,
    amount: existing ? String(Math.abs(Number(existing.amount))) : "",
    category: existing?.category || "General",
    fund: existing?.fund || "General",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) return;
    setSaving(true);
    const raw = Math.abs(Number(form.amount));
    const amount = form.type === "Expense" ? -raw : raw;
    const data = {
      description: form.description.trim(),
      category: form.category.trim() || "General",
      fund: form.fund.trim() || "General",
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
