import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, BookOpen, Trash2, Search, Mic,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function SermonsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [sermons, setSermons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM sermon WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]);
    setSermons(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return sermons;
    const q = search.toLowerCase();
    return sermons.filter((s) => s.title?.toLowerCase().includes(q) || s.preacher?.toLowerCase().includes(q) || s.series?.toLowerCase().includes(q));
  }, [sermons, search]);

  const stats = useMemo(() => {
    const preachers = new Set(sermons.map((s) => s.preacher?.toLowerCase()).filter(Boolean)).size;
    const seriesSet = new Set(sermons.map((s) => s.series?.toLowerCase()).filter(Boolean)).size;
    return { total: sermons.length, preachers, series: seriesSet };
  }, [sermons]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this sermon?")) return;
    setSermons((prev) => prev.filter((s) => s.id !== id));
    showToast("Sermon deleted");
    await db.delete("sermon", id);
  }

  return (
    <PageShell title="Sermons">
      <PageHeader title="Sermons" description="Manage sermon records and series.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Sermon
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Sermons" value={stats.total} icon={BookOpen} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Preachers" value={stats.preachers} icon={Mic} color="bg-success/10 text-success" />
        <StatCard label="Series" value={stats.series} icon={BookOpen} color="bg-gold/10 text-gold" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search sermons..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No sermons match" : "No sermons yet"}</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {filtered.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-ink truncate">{s.title}</h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                    <Mic className="size-3" />
                    <span>{s.preacher || "Unknown"}</span>
                    {s.series && <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-bright">{s.series}</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-faint">{formatDate(s.date)}</p>
                  {s.scripture && <p className="mt-1 text-xs text-ink-muted italic">{s.scripture}</p>}
                </div>
                <button onClick={() => handleDelete(s.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger ml-2">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Sermon">
        <SermonForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function SermonForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", preacher: "", series: "", scripture: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("sermon", {
      id: uuid(), church_id: churchId, title: form.title.trim(),
      preacher: form.preacher || null, series: form.series || null,
      scripture: form.scripture || null, date: form.date, notes: form.notes || null,
    });
    showToast("Sermon added"); setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="Sermon title" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Preacher</label><input value={form.preacher} onChange={set("preacher")} className="input" placeholder="Name" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Series</label><input value={form.series} onChange={set("series")} className="input" placeholder="Series name" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Scripture</label><input value={form.scripture} onChange={set("scripture")} className="input" placeholder="e.g. John 3:16" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Adding..." : "Add Sermon"}</button>
      </div>
    </form>
  );
}
