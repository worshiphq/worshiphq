import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Package, Trash2, Search, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const CONDITIONS = ["new", "good", "fair", "poor", "decommissioned"];

export function AssetsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM asset WHERE church_id = ? ORDER BY name ASC", [session!.churchId]);
    setAssets(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.name?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q) || a.location?.toLowerCase().includes(q));
  }, [assets, search]);

  const stats = useMemo(() => {
    const totalValue = assets.reduce((s, a) => s + (a.purchase_price || 0), 0);
    const categories = new Set(assets.map((a) => a.category?.toLowerCase()).filter(Boolean)).size;
    return { total: assets.length, totalValue, categories };
  }, [assets]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this asset?")) return;
    setAssets((prev) => prev.filter((a) => a.id !== id));
    showToast("Asset deleted");
    await db.delete("asset", id);
  }

  const conditionColor = (c: string) => {
    const lc = c.toLowerCase();
    if (lc === "new" || lc === "good") return "bg-success/10 text-success";
    if (lc === "fair") return "bg-gold/10 text-gold";
    return "bg-danger/10 text-danger";
  };

  return (
    <PageShell title="Assets">
      <PageHeader title="Church Assets" description="Inventory of church property and equipment.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Asset
        </button>
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Assets" value={stats.total} icon={Package} color="text-primary-bright" />
        <StatCard label="Total Value" value={formatCurrency(stats.totalValue)} icon={Package} color="text-success" />
        <StatCard label="Categories" value={stats.categories} icon={Package} color="text-gold" />
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-10 pl-9" placeholder="Search assets..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No assets match" : "No assets recorded yet"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Asset</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Category</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Value</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Condition</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Location</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{a.category || "—"}</span></td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{formatCurrency(a.purchase_price || 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", conditionColor(a.condition || ""))}>{a.condition || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{a.location || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(a); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                      <button onClick={() => handleDelete(a.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Asset" : "Add Asset"}>
        <AssetForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function AssetForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: existing?.name || "", category: existing?.category || "",
    purchase_price: existing?.purchase_price != null ? String(existing.purchase_price) : "",
    condition: existing?.condition || "new", location: existing?.location || "",
    serial_no: existing?.serial_no || "", purchase_date: existing?.purchase_date ? existing.purchase_date.slice(0, 10) : "",
    notes: existing?.notes || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      name: form.name.trim(), category: form.category || null,
      purchase_price: Number(form.purchase_price) || 0,
      condition: form.condition, location: form.location || null,
      serial_no: form.serial_no || null, purchase_date: form.purchase_date || null,
      notes: form.notes || null,
    };
    if (existing) {
      await db.update("asset", existing.id, data);
      showToast("Asset updated");
    } else {
      await db.insert("asset", { id: uuid(), church_id: churchId, ...data });
      showToast("Asset added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Asset Name *</label><input value={form.name} onChange={set("name")} className="input" required placeholder="e.g. Projector, Piano" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Category</label><input value={form.category} onChange={set("category")} className="input" placeholder="e.g. Electronics" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Value (GHS)</label><input type="number" step="0.01" value={form.purchase_price} onChange={set("purchase_price")} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Condition</label>
          <select value={form.condition} onChange={set("condition")} className="input capitalize">{CONDITIONS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Location</label><input value={form.location} onChange={set("location")} className="input" placeholder="e.g. Main Hall" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Serial No.</label><input value={form.serial_no} onChange={set("serial_no")} className="input" placeholder="Serial number" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Purchase Date</label><input type="date" value={form.purchase_date} onChange={set("purchase_date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} placeholder="Additional details" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add Asset"}</button>
      </div>
    </form>
  );
}
