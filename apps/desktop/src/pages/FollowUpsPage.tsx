import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, ClipboardCheck, Trash2, Search, CheckCircle2, Clock, AlertCircle, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function FollowUpsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM follow_up WHERE church_id = ? ORDER BY due_date ASC LIMIT 500", [session!.churchId]);
    setFollowUps(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = followUps;
    if (filter !== "all") list = list.filter((f) => f.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.title?.toLowerCase().includes(q) || f.type?.toLowerCase().includes(q));
    }
    return list;
  }, [followUps, search, filter]);

  const stats = useMemo(() => {
    const pending = followUps.filter((f) => f.status === "pending" || !f.status).length;
    const completed = followUps.filter((f) => f.status === "completed").length;
    const overdue = followUps.filter((f) => {
      if (f.status === "completed") return false;
      if (!f.due_date) return false;
      return new Date(f.due_date) < new Date();
    }).length;
    return { total: followUps.length, pending, completed, overdue };
  }, [followUps]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this follow-up?")) return;
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    showToast("Deleted");
    await db.delete("follow_up", id);
  }

  async function toggleStatus(f: any) {
    const newStatus = f.status === "completed" ? "pending" : "completed";
    setFollowUps((prev) => prev.map((p) => p.id === f.id ? { ...p, status: newStatus } : p));
    await db.update("follow_up", f.id, { status: newStatus });
    showToast(newStatus === "completed" ? "Marked complete" : "Reopened");
  }

  return (
    <PageShell title="Follow-ups">
      <PageHeader title="Follow-ups" description="Track pastoral follow-ups and care tasks.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Follow-up
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} icon={ClipboardCheck} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="bg-gold/10 text-gold" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="bg-success/10 text-success" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} color="bg-danger/10 text-danger" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search follow-ups..." />
        </div>
        <div className="flex gap-1">
          {["all", "pending", "completed"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3"
              )}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <ClipboardCheck className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || filter !== "all" ? "No matching follow-ups" : "No follow-ups yet"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const isOverdue = f.status !== "completed" && f.due_date && new Date(f.due_date) < new Date();
            return (
              <div key={f.id} className={cn("card p-4", isOverdue && "border-danger/30")}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleStatus(f)} className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    f.status === "completed" ? "border-success bg-success/10" : "border-line hover:border-primary-bright"
                  )}>
                    {f.status === "completed" && <CheckCircle2 className="size-4 text-success" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-bold", f.status === "completed" ? "text-ink-muted line-through" : "text-ink")}>{f.title}</span>
                      {f.type && <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">{f.type}</span>}
                      {isOverdue && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">Overdue</span>}
                    </div>
                    {f.notes && <p className="mt-1 text-sm text-ink-muted">{f.notes}</p>}
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
                      {f.due_date && <span>Due: {formatDate(f.due_date)}</span>}
                      <span>Created: {formatDate(f.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(f); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                    <button onClick={() => handleDelete(f.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Follow-up" : "New Follow-up"}>
        <FollowUpForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function FollowUpForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "", type: existing?.type || "",
    due_date: existing?.due_date || "", notes: existing?.notes || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      title: form.title.trim(), type: form.type || null,
      due_date: form.due_date || null, notes: form.notes || null,
    };
    if (existing) {
      await db.update("follow_up", existing.id, data);
      showToast("Follow-up updated");
    } else {
      await db.insert("follow_up", { id: uuid(), church_id: churchId, ...data, status: "pending" });
      showToast("Follow-up created");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="e.g. Visit Bro. Kwame" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">
            <option value="">General</option><option>Visit</option><option>Call</option><option>Counseling</option><option>Prayer</option><option>New Convert</option>
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Due Date</label><input type="date" value={form.due_date} onChange={set("due_date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Create"}</button>
      </div>
    </form>
  );
}
