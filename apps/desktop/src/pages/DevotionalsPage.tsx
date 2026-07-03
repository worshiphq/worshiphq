import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, BookHeart, Trash2, Search, Pencil, Eye, EyeOff,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function DevotionalsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [devotionals, setDevotionals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM devotional WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]);
    setDevotionals(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return devotionals;
    const q = search.toLowerCase();
    return devotionals.filter((d) => d.title?.toLowerCase().includes(q) || d.author?.toLowerCase().includes(q));
  }, [devotionals, search]);

  const stats = useMemo(() => {
    const published = devotionals.filter((d) => d.published).length;
    return { total: devotionals.length, published, drafts: devotionals.length - published };
  }, [devotionals]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this devotional?")) return;
    setDevotionals((prev) => prev.filter((d) => d.id !== id));
    showToast("Deleted");
    await db.delete("devotional", id);
  }

  async function togglePublished(d: any) {
    const next = d.published ? 0 : 1;
    setDevotionals((prev) => prev.map((p) => p.id === d.id ? { ...p, published: next } : p));
    await db.update("devotional", d.id, { published: next });
    showToast(next ? "Published" : "Unpublished");
  }

  return (
    <PageShell title="Devotionals">
      <PageHeader title="Devotionals" description="Daily devotionals and spiritual content.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Devotional
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Devotionals" value={stats.total} icon={BookHeart} color="text-primary-bright" />
        <StatCard label="Published" value={stats.published} icon={Eye} color="text-success" />
        <StatCard label="Drafts" value={stats.drafts} icon={EyeOff} color="text-gold" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search devotionals..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <BookHeart className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No devotionals match" : "No devotionals yet"}</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {filtered.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink">{d.title}</h3>
                    {!d.published && <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">Draft</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">{d.author || "Unknown"} · {formatDate(d.date)}</p>
                  {d.scripture && <p className="mt-1 text-xs text-primary-bright italic">{d.scripture}</p>}
                  {d.body && <p className="mt-2 text-sm text-ink-muted line-clamp-3">{d.body}</p>}
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => togglePublished(d)} className={cn("grid size-7 place-items-center rounded-lg", d.published ? "text-success hover:bg-success/10" : "text-ink-faint hover:bg-surface-3")} title={d.published ? "Unpublish" : "Publish"}>
                    {d.published ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button onClick={() => { setEditing(d); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => handleDelete(d.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Devotional" : "Add Devotional"}>
        <DevotionalForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function DevotionalForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "", author: existing?.author || "",
    scripture: existing?.scripture || "", body: existing?.body || "",
    date: existing?.date || new Date().toISOString().slice(0, 10),
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      title: form.title.trim(), author: form.author || null,
      scripture: form.scripture || null, body: form.body || null, date: form.date,
    };
    if (existing) {
      await db.update("devotional", existing.id, data);
      showToast("Devotional updated");
    } else {
      await db.insert("devotional", { id: uuid(), church_id: churchId, ...data, published: 1 });
      showToast("Devotional added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Author</label><input value={form.author} onChange={set("author")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Scripture</label><input value={form.scripture} onChange={set("scripture")} className="input" placeholder="e.g. Psalm 23:1" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Content</label><textarea value={form.body} onChange={set("body")} className="input" rows={4} /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add"}</button>
      </div>
    </form>
  );
}
