import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Wheat, Trash2, Search,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function HarvestPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [harvests, setHarvests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM harvest WHERE church_id = ? ORDER BY year DESC, date DESC", [session!.churchId]);
    setHarvests(rows);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const totalGoal = harvests.reduce((s, h) => s + (h.goal || 0), 0);
    const totalRaised = harvests.reduce((s, h) => s + (h.raised || 0), 0);
    return { count: harvests.length, totalGoal, totalRaised };
  }, [harvests]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this harvest?")) return;
    setHarvests((prev) => prev.filter((h) => h.id !== id));
    showToast("Deleted");
    await db.delete("harvest", id);
  }

  return (
    <PageShell title="Harvest">
      <PageHeader title="Harvest" description="Track annual harvest campaigns and giving.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Harvest
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Harvests" value={stats.count} icon={Wheat} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Total Goal" value={formatCurrency(stats.totalGoal)} icon={Wheat} color="bg-gold/10 text-gold" />
        <StatCard label="Total Raised" value={formatCurrency(stats.totalRaised)} icon={Wheat} color="bg-success/10 text-success" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : harvests.length === 0 ? (
        <div className="py-16 text-center">
          <Wheat className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">No harvest campaigns yet</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {harvests.map((h) => {
            const pct = h.goal > 0 ? Math.round(((h.raised || 0) / h.goal) * 100) : 0;
            return (
              <div key={h.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-ink">{h.title}</h3>
                    <p className="text-xs text-ink-faint">{h.year}{h.date ? ` · ${formatDate(h.date)}` : ""}</p>
                  </div>
                  <button onClick={() => handleDelete(h.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-success font-bold">{formatCurrency(h.raised || 0)}</span>
                  <span className="text-ink-faint">of {formatCurrency(h.goal)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-success" : "bg-gradient-to-r from-gold to-gold/70")}
                    style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-ink-faint text-right">{pct}% of goal</p>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Harvest">
        <HarvestForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function HarvestForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", year: String(new Date().getFullYear()), goal: "", date: "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("harvest", {
      id: uuid(), church_id: churchId, title: form.title.trim(),
      year: Number(form.year), goal: Number(form.goal) || 0, raised: 0,
      date: form.date || null,
    });
    showToast("Harvest created"); setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="e.g. Annual Harvest 2026" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Year</label><input type="number" value={form.year} onChange={set("year")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Goal (GHS)</label><input type="number" step="0.01" value={form.goal} onChange={set("goal")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Creating..." : "Create"}</button>
      </div>
    </form>
  );
}
