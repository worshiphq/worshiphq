import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, HandHeart, Trash2, Search, CheckCircle2, Clock, Archive, Pencil, Heart, Link2, Copy,
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
  const [slug, setSlug] = useState<string>("");
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
    const rows = await db.rawQuery("SELECT * FROM prayer_request WHERE church_id = ? ORDER BY status ASC, created_at DESC LIMIT 500", [session!.churchId]);
    setRequests(rows);
    const church = await db.getById("church", session!.churchId);
    setSlug(church?.slug || "");
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = requests;
    if (filter !== "all") list = list.filter((r) => (r.status || "active") === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name?.toLowerCase().includes(q) || r.request?.toLowerCase().includes(q));
    }
    return list;
  }, [requests, search, filter]);

  const stats = useMemo(() => {
    const active = requests.filter((r) => (r.status || "active") === "active").length;
    const answered = requests.filter((r) => r.status === "answered").length;
    return { total: requests.length, active, answered };
  }, [requests]);

  const prayUrl = slug ? `https://worshiphq.app/pray/${slug}` : "";

  async function handleDelete(id: string) {
    if (!confirm("Delete this prayer request?")) return;
    setRequests((prev) => prev.filter((r) => r.id !== id));
    showToast("Prayer request deleted");
    await db.delete("prayer_request", id);
  }

  // Cycle: active -> answered -> archived -> active (matches web).
  async function cycleStatus(r: any) {
    const cur = r.status || "active";
    const next = cur === "active" ? "answered" : cur === "answered" ? "archived" : "active";
    setRequests((prev) => prev.map((p) => p.id === r.id ? { ...p, status: next } : p));
    await db.update("prayer_request", r.id, { status: next });
    showToast(`Marked as ${next}`);
  }

  async function pray(r: any) {
    const next = (r.prayer_count || 0) + 1;
    setRequests((prev) => prev.map((p) => p.id === r.id ? { ...p, prayer_count: next } : p));
    await db.update("prayer_request", r.id, { prayer_count: next });
  }

  function copyLink() {
    if (!prayUrl) return;
    navigator.clipboard?.writeText(prayUrl);
    showToast("Prayer link copied");
  }

  return (
    <PageShell title="Prayer Requests">
      <PageHeader title="Prayer Requests" description="View and manage prayer requests from your congregation.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Request
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Requests" value={stats.total} icon={HandHeart} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Active" value={stats.active} icon={Clock} color="bg-gold/10 text-gold" />
        <StatCard label="Answered" value={stats.answered} icon={CheckCircle2} color="bg-success/10 text-success" />
      </div>

      {prayUrl && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-sm">
          <Link2 className="size-4 text-primary-bright shrink-0" />
          <span className="text-ink-muted">Public prayer link:</span>
          <code className="rounded bg-surface-3 px-2 py-1 text-xs text-ink">{prayUrl}</code>
          <button onClick={copyLink} className="btn-secondary btn-sm"><Copy className="size-3.5" /> Copy</button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search requests..." />
        </div>
        <div className="flex gap-1">
          {["all", "active", "answered", "archived"].map((f) => (
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
          {filtered.map((r) => {
            const status = r.status || "active";
            return (
              <div key={r.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <button onClick={() => cycleStatus(r)}
                    className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      status === "answered" ? "border-success bg-success/10" : status === "archived" ? "border-line bg-surface-3" : "border-line hover:border-primary-bright"
                    )}
                    title={`Mark as ${status === "active" ? "answered" : status === "answered" ? "archived" : "active"}`}>
                    {status === "answered" && <CheckCircle2 className="size-4 text-success" />}
                    {status === "archived" && <Archive className="size-3 text-ink-faint" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">{r.is_anonymous ? "Anonymous" : (r.name || "Anonymous")}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                        status === "answered" ? "bg-success/10 text-success" : status === "archived" ? "bg-surface-3 text-ink-faint" : "bg-gold/10 text-gold"
                      )}>{status}</span>
                    </div>
                    <p className={cn("mt-1 text-sm text-ink-muted", status === "archived" && "line-through")}>{r.request}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
                      <span>{formatDate(r.created_at)}</span>
                      <button onClick={() => pray(r)} className="inline-flex items-center gap-1 text-ink-muted hover:text-primary-bright" title="I prayed">
                        <Heart className="size-3" /> {r.prayer_count || 0} prayed
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(r); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                    <button onClick={() => handleDelete(r.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
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
  const [form, setForm] = useState({
    name: existing?.name || "", request: existing?.request || "",
    is_anonymous: existing?.is_anonymous ? true : false,
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.request.trim()) return;
    setSaving(true);
    const anon = form.is_anonymous || !form.name.trim();
    const data = {
      name: anon ? "Anonymous" : form.name.trim(),
      request: form.request.trim(),
      is_anonymous: anon ? 1 : 0,
    };
    if (existing) {
      await db.update("prayer_request", existing.id, data);
      showToast("Prayer request updated");
    } else {
      await db.insert("prayer_request", { id: uuid(), church_id: churchId, ...data, status: "active", prayer_count: 0 });
      showToast("Prayer request added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Name</label><input value={form.name} onChange={set("name")} className="input" placeholder="Full name (optional)" disabled={form.is_anonymous} /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Prayer Request *</label><textarea value={form.request} onChange={set("request")} className="input" rows={4} required placeholder="What would you like prayer for?" /></div>
      <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm((f) => ({ ...f, is_anonymous: e.target.checked }))} /> Submit anonymously</label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add Request"}</button>
      </div>
    </form>
  );
}
