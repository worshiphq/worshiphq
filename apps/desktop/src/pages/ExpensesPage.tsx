import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Receipt, Trash2, Search, Wallet, TrendingUp, Calendar, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const CATEGORIES = ["Utilities", "Supplies", "Transport", "Rent", "Salary", "Maintenance", "Equipment", "Food", "Donation", "Other"];

export function ExpensesPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM expense WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]);
    setExpenses(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return expenses;
    const q = search.toLowerCase();
    return expenses.filter((e) => e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q) || e.vendor?.toLowerCase().includes(q));
  }, [expenses, search]);

  const stats = useMemo(() => {
    const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const now = new Date();
    const thisMonth = expenses.filter((e) => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const monthTotal = thisMonth.reduce((s, e) => s + (e.amount || 0), 0);
    return { total, monthTotal, count: expenses.length };
  }, [expenses]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    const exp = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    showToast("Expense deleted");
    await db.delete("expense", id);
    // Mirror web: remove the paired ledger transaction (amount is negative).
    if (exp) {
      const txDesc = `${exp.description}${exp.vendor ? ` (${exp.vendor})` : ""}`;
      const rows = await db.rawQuery('SELECT id FROM "transaction" WHERE church_id = ? AND description = ? AND amount = ?', [exp.church_id, txDesc, -(exp.amount || 0)]);
      for (const r of rows) await db.delete("transaction", r.id);
    }
  }

  return (
    <PageShell title="Expenses">
      <PageHeader title="Expenses" description="Track and categorize church expenditures.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Record Expense
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Expenses" value={formatCurrency(stats.total)} icon={Receipt} color="text-danger" />
        <StatCard label="This Month" value={formatCurrency(stats.monthTotal)} icon={Calendar} color="text-gold" />
        <StatCard label="Records" value={stats.count} icon={Wallet} color="text-primary-bright" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search expenses..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No expenses match" : "No expenses recorded yet"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Description</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Category</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Vendor</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{e.description}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{e.category || "—"}</span></td>
                  <td className="px-4 py-3 text-ink-muted">{e.vendor || "—"}</td>
                  <td className="px-4 py-3 text-right font-bold text-danger">{formatCurrency(e.amount)}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(e); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                      <button onClick={() => handleDelete(e.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Expense" : "Record Expense"}>
        <ExpenseForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function ExpenseForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: existing?.description || "", category: existing?.category || "Other",
    vendor: existing?.vendor || "", amount: existing?.amount != null ? String(existing.amount) : "",
    receipt_ref: existing?.receipt_ref || "", approved_by: existing?.approved_by || "",
    date: existing?.date || new Date().toISOString().slice(0, 10),
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const amount = Number(form.amount) || 0;
    const vendor = form.vendor || null;
    const data = {
      description: form.description.trim(), category: form.category,
      vendor, amount,
      receipt_ref: form.receipt_ref || null, approved_by: form.approved_by || null, date: form.date,
    };
    if (existing) {
      await db.update("expense", existing.id, data);
      showToast("Expense updated");
    } else {
      await db.insert("expense", { id: uuid(), church_id: churchId, ...data });
      // Mirror web: write a paired ledger transaction (negative amount) into the accounting ledger.
      await db.insert("transaction", {
        id: uuid(), church_id: churchId,
        description: `${data.description}${vendor ? ` (${vendor})` : ""}`,
        category: data.category, fund: "General", amount: -amount, date: form.date,
      });
      showToast("Expense recorded");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Description *</label><input value={form.description} onChange={set("description")} className="input" required placeholder="What was this expense for?" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Category</label>
          <select value={form.category} onChange={set("category")} className="input">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Vendor</label><input value={form.vendor} onChange={set("vendor")} className="input" placeholder="Supplier name" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Amount (GHS) *</label><input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="input" required /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Receipt Ref</label><input value={form.receipt_ref} onChange={set("receipt_ref")} className="input" placeholder="Receipt / invoice no." /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Approved By</label><input value={form.approved_by} onChange={set("approved_by")} className="input" placeholder="Approver name" /></div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Record"}</button>
      </div>
    </form>
  );
}
