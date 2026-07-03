import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Star, Trash2, Search, Pencil, Eye, EyeOff,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const CATEGORIES = ["praise", "healing", "provision", "salvation", "deliverance", "breakthrough", "other"];

export function TestimoniesPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [testimonies, setTestimonies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  const [people, setPeople] = useState<any[]>([]);

  async function loadData() {
    setLoading(true);
    const [rows, ppl] = await Promise.all([
      db.rawQuery("SELECT * FROM testimony WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? AND status = 'active' ORDER BY first_name ASC", [session!.churchId]),
    ]);
    setTestimonies(rows);
    setPeople(ppl);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = testimonies;
    if (filter !== "all") list = list.filter((t) => t.category === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title?.toLowerCase().includes(q) || t.body?.toLowerCase().includes(q));
    }
    return list;
  }, [testimonies, search, filter]);

  const stats = useMemo(() => {
    const featured = testimonies.filter((t) => t.status === "featured").length;
    const praise = testimonies.filter((t) => t.category === "praise").length;
    const healing = testimonies.filter((t) => t.category === "healing").length;
    return { total: testimonies.length, featured, praise, healing };
  }, [testimonies]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this testimony?")) return;
    setTestimonies((prev) => prev.filter((t) => t.id !== id));
    showToast("Deleted");
    await db.delete("testimony", id);
  }

  async function toggleFeatured(t: any) {
    const newStatus = t.status === "featured" ? "approved" : "featured";
    setTestimonies((prev) => prev.map((p) => p.id === t.id ? { ...p, status: newStatus } : p));
    await db.update("testimony", t.id, { status: newStatus });
    showToast(newStatus === "featured" ? "Featured!" : "Unfeatured");
  }

  return (
    <PageShell title="Testimonies">
      <PageHeader title="Testimonies" description="Manage and share testimonies from the congregation.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Testimony
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} icon={Star} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Featured" value={stats.featured} icon={Star} color="bg-gold/10 text-gold" />
        <StatCard label="Praise" value={stats.praise} icon={Star} color="bg-success/10 text-success" />
        <StatCard label="Healing" value={stats.healing} icon={Star} color="bg-info/10 text-info" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search testimonies..." />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input h-9 max-w-[10rem]">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Star className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || filter !== "all" ? "No testimonies match" : "No testimonies yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className={cn("card p-4", t.status === "featured" && "border-gold/30")}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {t.status === "featured" && <Star className="size-3.5 fill-gold text-gold" />}
                    <h3 className="font-bold text-ink">{t.title}</h3>
                    {t.category && <span className="rounded-md bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gold">{t.category}</span>}
                    {t.anonymous ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-ink-faint">Anonymous</span> : null}
                  </div>
                  {t.body && <p className="mt-1.5 text-sm text-ink-muted line-clamp-3">{t.body}</p>}
                  <p className="mt-1 text-[11px] text-ink-faint">{formatDate(t.date)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => toggleFeatured(t)} className={cn("grid size-7 place-items-center rounded-lg", t.status === "featured" ? "text-gold hover:bg-gold/10" : "text-ink-faint hover:bg-surface-3")} title={t.status === "featured" ? "Unfeature" : "Feature"}>
                    {t.status === "featured" ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button onClick={() => { setEditing(t); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => handleDelete(t.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Testimony" : "Add Testimony"}>
        <TestimonyForm churchId={session!.churchId} existing={editing} people={people} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function TestimonyForm({ churchId, existing, people, onClose, onSaved }: { churchId: string; existing?: any; people: any[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "", category: existing?.category || "praise",
    body: existing?.body || "", date: existing?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    anonymous: existing?.anonymous ? true : false, person_id: existing?.person_id || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    const data = {
      title: form.title.trim(), category: form.category || "praise",
      body: form.body.trim(), date: form.date, anonymous: form.anonymous ? 1 : 0,
      person_id: form.person_id || null,
    };
    if (existing) {
      await db.update("testimony", existing.id, data);
      showToast("Testimony updated");
    } else {
      // Web creates testimonies as "approved" (staff-entered).
      await db.insert("testimony", { id: uuid(), church_id: churchId, ...data, status: "approved" });
      showToast("Testimony added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="Testimony title" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Category</label>
          <select value={form.category} onChange={set("category")} className="input capitalize">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Member (optional)</label>
        <select value={form.person_id} onChange={set("person_id")} className="input">
          <option value="">— None —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
        </select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Testimony *</label><textarea value={form.body} onChange={set("body")} className="input" rows={4} required placeholder="Share the testimony..." /></div>
      <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={form.anonymous} onChange={(e) => setForm((f) => ({ ...f, anonymous: e.target.checked }))} /> Share anonymously</label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add"}</button>
      </div>
    </form>
  );
}
