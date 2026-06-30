import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, HandHeart, Trash2, Search, CheckCircle2, Clock, AlertCircle, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function PrayerRequestsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [requests, setRequests] = useState<any[]>([]);
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
    const rows = await db.rawQuery("SELECT * FROM prayer_request WHERE church_id = ? ORDER BY created_at DESC LIMIT 500", [session!.churchId]);
    setRequests(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = requests;
    if (filter !== "all") list = list.filter((r) => r.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name?.toLowerCase().includes(q) || r.request?.toLowerCase().includes(q));
    }
    return list;
  }, [requests, search, filter]);

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending" || !r.status).length;
    const answered = requests.filter((r) => r.status === "answered").length;
    return { total: requests.length, pending, answered };
  }, [requests]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this prayer request?")) return;
    setRequests((prev) => prev.filter((r) => r.id !== id));
    showToast("Prayer request deleted");
    await db.delete("prayer_request", id);
  }

  async function toggleStatus(r: any) {
    const newStatus = r.status === "answered" ? "pending" : "answered";
    setRequests((prev) => prev.map((p) => p.id === r.id ? { ...p, status: newStatus } : p));
    await db.update("prayer_request", r.id, { status: newStatus });
    showToast(newStatus === "answered" ? "Marked as answered" : "Marked as pending");
  }

  return (
    <PageShell title="Prayer Requests">
      <PageHeader title="Prayer Requests" description="Track and manage prayer requests from the congregation.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Request
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Requests" value={stats.total} icon={HandHeart} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="bg-gold/10 text-gold" />
        <StatCard label="Answered" value={stats.answered} icon={CheckCircle2} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search requests..." />
        </div>
        <div className="flex gap-1">
          {["all", "pending", "answered"].map((f) => (
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
          <HandHeart className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || filter !== "all" ? "No matching requests" : "No prayer requests yet"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleStatus(r)} className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  r.status === "answered" ? "border-success bg-success/10" : "border-line hover:border-primary-bright"
                )}>
                  {r.status === "answered" && <CheckCircle2 className="size-4 text-success" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{r.name || "Anonymous"}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                      r.status === "answered" ? "bg-success/10 text-success" : "bg-gold/10 text-gold"
                    )}>{r.status || "pending"}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{r.request}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">{formatDate(r.created_at)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(r); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => handleDelete(r.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Prayer Request" : "New Prayer Request"}>
        <PrayerForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function PrayerForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: existing?.name || "", request: existing?.request || "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = { name: form.name.trim() || null, request: form.request.trim() };
    if (existing) {
      await db.update("prayer_request", existing.id, data);
      showToast("Prayer request updated");
    } else {
      await db.insert("prayer_request", { id: uuid(), church_id: churchId, ...data, status: "pending" });
      showToast("Prayer request added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Name</label><input value={form.name} onChange={set("name")} className="input" placeholder="Requester name (optional)" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Prayer Request *</label><textarea value={form.request} onChange={set("request")} className="input" rows={4} required placeholder="Describe the prayer request..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add Request"}</button>
      </div>
    </form>
  );
}
