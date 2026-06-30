import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Star, Trash2, Search, CheckCircle2, Clock,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function TestimoniesPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [testimonies, setTestimonies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM testimony WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]);
    setTestimonies(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return testimonies;
    const q = search.toLowerCase();
    return testimonies.filter((t) => t.title?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q));
  }, [testimonies, search]);

  const stats = useMemo(() => {
    const approved = testimonies.filter((t) => t.status === "approved").length;
    const pending = testimonies.filter((t) => t.status === "pending" || !t.status).length;
    return { total: testimonies.length, approved, pending };
  }, [testimonies]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this testimony?")) return;
    setTestimonies((prev) => prev.filter((t) => t.id !== id));
    showToast("Deleted");
    await db.delete("testimony", id);
  }

  async function toggleApprove(t: any) {
    const newStatus = t.status === "approved" ? "pending" : "approved";
    setTestimonies((prev) => prev.map((p) => p.id === t.id ? { ...p, status: newStatus } : p));
    await db.update("testimony", t.id, { status: newStatus });
    showToast(newStatus === "approved" ? "Approved" : "Set to pending");
  }

  return (
    <PageShell title="Testimonies">
      <PageHeader title="Testimonies" description="Manage and share testimonies from the congregation.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Testimony
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total" value={stats.total} icon={Star} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} color="bg-success/10 text-success" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="bg-gold/10 text-gold" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search testimonies..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Star className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No testimonies match" : "No testimonies yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleApprove(t)} className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  t.status === "approved" ? "border-success bg-success/10" : "border-line hover:border-primary-bright"
                )}>
                  {t.status === "approved" && <CheckCircle2 className="size-4 text-success" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink">{t.title}</h3>
                    {t.category && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">{t.category}</span>}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                      t.status === "approved" ? "bg-success/10 text-success" : "bg-surface-3 text-ink-faint"
                    )}>{t.status || "pending"}</span>
                  </div>
                  {t.body && <p className="mt-1.5 text-sm text-ink-muted line-clamp-3">{t.body}</p>}
                  <p className="mt-1 text-[11px] text-ink-faint">{formatDate(t.date)}</p>
                </div>
                <button onClick={() => handleDelete(t.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Testimony">
        <TestimonyForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function TestimonyForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", body: "", date: new Date().toISOString().slice(0, 10) });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("testimony", {
      id: uuid(), church_id: churchId, title: form.title.trim(),
      category: form.category || null, body: form.body || null,
      date: form.date, status: "pending",
    });
    showToast("Testimony added"); setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="Testimony title" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Category</label>
          <select value={form.category} onChange={set("category")} className="input">
            <option value="">General</option><option>Healing</option><option>Provision</option><option>Salvation</option><option>Deliverance</option><option>Breakthrough</option><option>Other</option>
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Testimony</label><textarea value={form.body} onChange={set("body")} className="input" rows={4} placeholder="Share the testimony..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Adding..." : "Add"}</button>
      </div>
    </form>
  );
}
