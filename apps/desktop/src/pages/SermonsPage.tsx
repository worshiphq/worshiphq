import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, BookOpen, Trash2, Search, Mic, Pencil, Eye, EyeOff,
  Headphones, Video,
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
  const [editing, setEditing] = useState<any>(null);

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
    const published = sermons.filter((s) => s.published).length;
    return { total: sermons.length, preachers, series: seriesSet, published };
  }, [sermons]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this sermon?")) return;
    setSermons((prev) => prev.filter((s) => s.id !== id));
    showToast("Sermon deleted");
    await db.delete("sermon", id);
  }

  async function togglePublished(s: any) {
    const next = s.published ? 0 : 1;
    setSermons((prev) => prev.map((p) => p.id === s.id ? { ...p, published: next } : p));
    await db.update("sermon", s.id, { published: next });
    showToast(next ? "Published" : "Unpublished");
  }

  async function openMedia(url: string) {
    if (!url) return;
    window.api?.openExternal(url);
  }

  return (
    <PageShell title="Sermons">
      <PageHeader title="Sermons" description="Manage sermon notes, audio, and video for your congregation.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Sermon
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Total Sermons" value={stats.total} icon={BookOpen} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Preachers" value={stats.preachers} icon={Mic} color="bg-success/10 text-success" />
        <StatCard label="Series" value={stats.series} icon={BookOpen} color="bg-gold/10 text-gold" />
        <StatCard label="Published" value={stats.published} icon={Eye} color="bg-info/10 text-info" />
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink truncate">{s.title}</h3>
                    {!s.published && <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">Draft</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                    <Mic className="size-3" />
                    <span>{s.preacher || "Unknown"}</span>
                    {s.series && <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-bright">{s.series}</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-faint">{formatDate(s.date)}</p>
                  {s.scripture && <p className="mt-1 text-xs text-ink-muted italic">{s.scripture}</p>}
                  {s.notes && <p className="mt-1.5 text-xs text-ink-muted line-clamp-2">{s.notes}</p>}
                  {(s.audio_url || s.video_url) && (
                    <div className="mt-2 flex items-center gap-2">
                      {s.audio_url && (
                        <button onClick={() => openMedia(s.audio_url)} className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-ink-muted hover:text-primary-bright">
                          <Headphones className="size-3" /> Audio
                        </button>
                      )}
                      {s.video_url && (
                        <button onClick={() => openMedia(s.video_url)} className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-ink-muted hover:text-primary-bright">
                          <Video className="size-3" /> Video
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => togglePublished(s)} className={cn("grid size-7 place-items-center rounded-lg", s.published ? "text-success hover:bg-success/10" : "text-ink-faint hover:bg-surface-3")} title={s.published ? "Unpublish" : "Publish"}>
                    {s.published ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button onClick={() => { setEditing(s); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => handleDelete(s.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Sermon" : "Add Sermon"}>
        <SermonForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function SermonForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "", preacher: existing?.preacher || "",
    series: existing?.series || "", scripture: existing?.scripture || "",
    date: existing?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10), notes: existing?.notes || "",
    audio_url: existing?.audio_url || "", video_url: existing?.video_url || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const data = {
      title: form.title.trim(), preacher: form.preacher || null,
      series: form.series || null, scripture: form.scripture || null,
      date: form.date, notes: form.notes || null,
      audio_url: form.audio_url.trim() || null, video_url: form.video_url.trim() || null,
    };
    if (existing) {
      await db.update("sermon", existing.id, data);
      showToast("Sermon updated");
    } else {
      await db.insert("sermon", { id: uuid(), church_id: churchId, ...data, published: 1 });
      showToast("Sermon added");
    }
    setSaving(false); onSaved();
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
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Audio URL</label><input value={form.audio_url} onChange={set("audio_url")} className="input" placeholder="https://..." /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Video URL</label><input value={form.video_url} onChange={set("video_url")} className="input" placeholder="https://youtube.com/..." /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={3} placeholder="Sermon notes or outline..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add Sermon"}</button>
      </div>
    </form>
  );
}
