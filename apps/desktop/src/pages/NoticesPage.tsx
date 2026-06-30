import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Bell, Trash2, Search, Pin,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function NoticesPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM church_notice WHERE church_id = ? ORDER BY pinned DESC, created_at DESC LIMIT 500", [session!.churchId]);
    setNotices(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return notices;
    const q = search.toLowerCase();
    return notices.filter((n) => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q));
  }, [notices, search]);

  const stats = useMemo(() => {
    const pinned = notices.filter((n) => n.pinned).length;
    return { total: notices.length, pinned };
  }, [notices]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this notice?")) return;
    setNotices((prev) => prev.filter((n) => n.id !== id));
    showToast("Notice deleted");
    await db.delete("church_notice", id);
  }

  async function togglePin(n: any) {
    const newPinned = n.pinned ? 0 : 1;
    setNotices((prev) => prev.map((p) => p.id === n.id ? { ...p, pinned: newPinned } : p));
    await db.update("church_notice", n.id, { pinned: newPinned });
    showToast(newPinned ? "Pinned" : "Unpinned");
  }

  return (
    <PageShell title="Notices">
      <PageHeader title="Church Notices" description="Announcements and notices for the congregation.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Notice
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Total Notices" value={stats.total} icon={Bell} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Pinned" value={stats.pinned} icon={Pin} color="bg-gold/10 text-gold" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search notices..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Bell className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No notices match" : "No notices yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <div key={n.id} className={cn("card p-4", n.pinned && "border-gold/30")}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {n.pinned ? <Pin className="size-3.5 text-gold" /> : null}
                    <h3 className="font-bold text-ink">{n.title}</h3>
                  </div>
                  {n.body && <p className="mt-1.5 text-sm text-ink-muted whitespace-pre-line">{n.body}</p>}
                  <p className="mt-2 text-[11px] text-ink-faint">{formatDate(n.created_at)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => togglePin(n)} className={cn("grid size-7 place-items-center rounded-lg transition-colors",
                    n.pinned ? "text-gold hover:bg-gold/10" : "text-ink-faint hover:bg-surface-3"
                  )}><Pin className="size-3.5" /></button>
                  <button onClick={() => handleDelete(n.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Notice">
        <NoticeForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function NoticeForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", pinned: false });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("church_notice", {
      id: uuid(), church_id: churchId, title: form.title.trim(),
      body: form.body || null, pinned: form.pinned ? 1 : 0,
    });
    showToast("Notice created"); setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input" required placeholder="Notice title" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Content</label><textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} className="input" rows={4} placeholder="Notice content..." /></div>
      <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} /> Pin this notice</label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Creating..." : "Create"}</button>
      </div>
    </form>
  );
}
