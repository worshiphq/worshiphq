import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, BookHeart, Trash2, Search,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function DevotionalsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [devotionals, setDevotionals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

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

  async function handleDelete(id: string) {
    if (!confirm("Delete this devotional?")) return;
    setDevotionals((prev) => prev.filter((d) => d.id !== id));
    showToast("Deleted");
    await db.delete("devotional", id);
  }

  return (
    <PageShell title="Devotionals">
      <PageHeader title="Devotionals" description="Daily devotionals and spiritual content.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Devotional
        </button>
      </PageHeader>

      <div className="mb-5">
        <StatCard label="Total Devotionals" value={devotionals.length} icon={BookHeart} color="bg-primary-soft text-primary-bright" />
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
                  <h3 className="font-bold text-ink">{d.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-muted">{d.author || "Unknown"} · {formatDate(d.date)}</p>
                  {d.scripture && <p className="mt-1 text-xs text-primary-bright italic">{d.scripture}</p>}
                  {d.body && <p className="mt-2 text-sm text-ink-muted line-clamp-3">{d.body}</p>}
                </div>
                <button onClick={() => handleDelete(d.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger ml-2">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Devotional">
        <DevotionalForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function DevotionalForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", scripture: "", body: "", date: new Date().toISOString().slice(0, 10) });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("devotional", {
      id: uuid(), church_id: churchId, title: form.title.trim(),
      author: form.author || null, scripture: form.scripture || null,
      body: form.body || null, date: form.date,
    });
    showToast("Devotional added"); setSaving(false); onSaved();
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
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Adding..." : "Add"}</button>
      </div>
    </form>
  );
}
