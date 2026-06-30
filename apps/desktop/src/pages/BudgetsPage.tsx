import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, PiggyBank, Trash2, ChevronDown, ChevronRight, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function BudgetsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showItemForm, setShowItemForm] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [b, i] = await Promise.all([
      db.rawQuery("SELECT * FROM budget WHERE church_id = ? ORDER BY year DESC, created_at DESC", [cid]),
      db.rawQuery("SELECT * FROM budget_item WHERE church_id = ? ORDER BY category ASC", [cid]),
    ]);
    setBudgets(b);
    setItems(i);
    setLoading(false);
    if (b.length > 0) setExpanded(new Set([b[0].id]));
  }

  const stats = useMemo(() => {
    const totalBudgeted = budgets.reduce((s, b) => s + (b.total || 0), 0);
    const totalSpent = items.reduce((s, i) => s + (i.spent || 0), 0);
    return { count: budgets.length, totalBudgeted, totalSpent };
  }, [budgets, items]);

  function toggleExpand(id: string) {
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this budget?")) return;
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    showToast("Budget deleted");
    await db.delete("budget", id);
  }

  return (
    <PageShell title="Budgets">
      <PageHeader title="Budget Management" description="Plan and track church budgets by year or quarter.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Budget
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Budgets" value={stats.count} icon={PiggyBank} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Total Budgeted" value={formatCurrency(stats.totalBudgeted)} icon={PiggyBank} color="bg-success/10 text-success" />
        <StatCard label="Total Spent" value={formatCurrency(stats.totalSpent)} icon={PiggyBank} color="bg-danger/10 text-danger" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : budgets.length === 0 ? (
        <div className="py-16 text-center">
          <PiggyBank className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">No budgets yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-4"><Plus className="size-3.5" /> New Budget</button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const budgetItems = items.filter((i) => i.budget_id === b.id);
            const totalAllocated = budgetItems.reduce((s, i) => s + (i.amount || 0), 0);
            const totalSpent = budgetItems.reduce((s, i) => s + (i.spent || 0), 0);
            const isExpanded = expanded.has(b.id);

            return (
              <div key={b.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => toggleExpand(b.id)}>
                  {isExpanded ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-ink">{b.name}</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold",
                        b.status === "active" ? "bg-success/10 text-success" : "bg-surface-3 text-ink-faint"
                      )}>{b.status || "draft"}</span>
                    </div>
                    <p className="text-xs text-ink-faint">{b.year}{b.quarter ? ` · Q${b.quarter}` : " · Annual"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-ink">{formatCurrency(totalAllocated)}</p>
                    <p className="text-[11px] text-ink-faint">{formatCurrency(totalSpent)} spent</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(b); setShowForm(true); }}
                    className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright ml-2" title="Edit">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                    className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-line">
                    {budgetItems.length === 0 ? (
                      <div className="p-4 text-center text-sm text-ink-muted">
                        No line items yet.
                        <button onClick={() => setShowItemForm(b.id)} className="ml-2 text-primary-bright hover:underline">Add item</button>
                      </div>
                    ) : (
                      <>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-surface-2/50">
                              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-ink-faint">Category</th>
                              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-ink-faint">Description</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-ink-faint">Allocated</th>
                              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-ink-faint">Spent</th>
                              <th className="px-4 py-2 text-center text-[11px] font-semibold uppercase text-ink-faint">%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line-soft">
                            {budgetItems.map((i) => {
                              const pct = i.amount > 0 ? Math.round(((i.spent || 0) / i.amount) * 100) : 0;
                              return (
                                <tr key={i.id}>
                                  <td className="px-4 py-2 font-medium text-ink">{i.category}</td>
                                  <td className="px-4 py-2 text-ink-muted">{i.description || "—"}</td>
                                  <td className="px-4 py-2 text-right">{formatCurrency(i.amount)}</td>
                                  <td className="px-4 py-2 text-right text-danger">{formatCurrency(i.spent || 0)}</td>
                                  <td className="px-4 py-2 text-center">
                                    <span className={cn("text-xs font-bold", pct > 100 ? "text-danger" : pct > 80 ? "text-gold" : "text-success")}>{pct}%</span>
                                  </td>
                                  <td className="px-4 py-2">
                                    <button onClick={() => { setEditingItem(i); setShowItemForm(b.id); }} className="grid size-6 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3" /></button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="p-3 border-t border-line">
                          <button onClick={() => setShowItemForm(b.id)} className="btn-ghost btn-sm text-xs">
                            <Plus className="size-3" /> Add Line Item
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Budget" : "Create Budget"}>
        <BudgetForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
      <Modal open={!!showItemForm} onClose={() => { setShowItemForm(null); setEditingItem(null); }} title={editingItem ? "Edit Budget Item" : "Add Budget Item"}>
        {showItemForm && <ItemForm churchId={session!.churchId} budgetId={showItemForm} existing={editingItem} onClose={() => { setShowItemForm(null); setEditingItem(null); }} onSaved={() => { setShowItemForm(null); setEditingItem(null); loadData(); }} />}
      </Modal>
    </PageShell>
  );
}

function BudgetForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();
  const [form, setForm] = useState({
    name: existing?.name || "", year: String(existing?.year ?? year),
    quarter: existing?.quarter != null ? String(existing.quarter) : "", notes: existing?.notes || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      name: form.name.trim(), year: Number(form.year),
      quarter: form.quarter ? Number(form.quarter) : null, notes: form.notes || null,
    };
    if (existing) {
      await db.update("budget", existing.id, data);
      showToast("Budget updated");
    } else {
      await db.insert("budget", { id: uuid(), church_id: churchId, ...data, total: 0, status: "draft" });
      showToast("Budget created");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Budget Name *</label><input value={form.name} onChange={set("name")} className="input" required placeholder="e.g. 2026 Annual Budget" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Year *</label><input type="number" value={form.year} onChange={set("year")} className="input" required /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Quarter</label>
          <select value={form.quarter} onChange={set("quarter")} className="input">
            <option value="">Annual</option><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
          </select>
        </div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Create"}</button>
      </div>
    </form>
  );
}

function ItemForm({ churchId, budgetId, existing, onClose, onSaved }: { churchId: string; budgetId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: existing?.category || "", description: existing?.description || "",
    amount: existing?.amount != null ? String(existing.amount) : "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      category: form.category.trim(), description: form.description || null,
      amount: Number(form.amount) || 0,
    };
    if (existing) {
      await db.update("budget_item", existing.id, data);
      showToast("Item updated");
    } else {
      await db.insert("budget_item", { id: uuid(), church_id: churchId, budget_id: budgetId, ...data, spent: 0 });
      showToast("Item added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Category *</label><input value={form.category} onChange={set("category")} className="input" required placeholder="e.g. Utilities, Rent" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Description</label><input value={form.description} onChange={set("description")} className="input" placeholder="Details" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Amount (GHS) *</label><input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="input" required /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update Item" : "Add Item"}</button>
      </div>
    </form>
  );
}
