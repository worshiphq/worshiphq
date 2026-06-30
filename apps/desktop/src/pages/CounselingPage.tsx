import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Heart, Trash2, Search, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const SESSION_TYPES = ["Pre-Marital", "Marriage", "Grief", "Spiritual", "Family", "Youth", "Addiction", "Other"];

export function CounselingPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM counseling_session WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]);
    setSessions(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => s.type?.toLowerCase().includes(q) || s.summary?.toLowerCase().includes(q) || s.counselee?.toLowerCase().includes(q));
  }, [sessions, search]);

  const stats = useMemo(() => {
    const active = sessions.filter((s) => s.status === "active" || s.status === "in_progress").length;
    const completed = sessions.filter((s) => s.status === "completed").length;
    return { total: sessions.length, active, completed };
  }, [sessions]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this counseling session?")) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    showToast("Deleted");
    await db.delete("counseling_session", id);
  }

  return (
    <PageShell title="Counseling">
      <PageHeader title="Counseling Sessions" description="Track pastoral counseling and care sessions.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Session
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Sessions" value={stats.total} icon={Heart} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Active" value={stats.active} icon={Clock} color="bg-gold/10 text-gold" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search sessions..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Heart className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No sessions match" : "No counseling sessions yet"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Counselee</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Summary</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{s.counselee || "Confidential"}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-bright">{s.type || "General"}</span></td>
                  <td className="px-4 py-3 text-ink-muted max-w-[200px] truncate">{s.summary || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                      s.status === "completed" ? "bg-success/10 text-success" :
                      s.status === "active" || s.status === "in_progress" ? "bg-gold/10 text-gold" :
                      "bg-surface-3 text-ink-faint"
                    )}>{s.status || "pending"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(s.date)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(s.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Counseling Session">
        <CounselingForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function CounselingForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ counselee: "", type: "Spiritual", summary: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("counseling_session", {
      id: uuid(), church_id: churchId, counselee: form.counselee || null,
      type: form.type, summary: form.summary || null,
      date: form.date, notes: form.notes || null, status: "active",
    });
    showToast("Session recorded"); setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Counselee</label><input value={form.counselee} onChange={set("counselee")} className="input" placeholder="Name (optional for privacy)" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">{SESSION_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Summary</label><textarea value={form.summary} onChange={set("summary")} className="input" rows={2} placeholder="Brief summary" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} placeholder="Private notes" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : "Save"}</button>
      </div>
    </form>
  );
}
