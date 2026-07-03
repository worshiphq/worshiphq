import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Heart, Trash2, Search, CheckCircle2, Clock, Shield,
  BookOpen, Users, AlertTriangle, CircleDot, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const TYPE_CONFIG: Record<string, { label: string; icon: any }> = {
  general: { label: "General", icon: BookOpen },
  marriage: { label: "Marriage", icon: Heart },
  grief: { label: "Grief", icon: AlertTriangle },
  spiritual: { label: "Spiritual", icon: Shield },
  family: { label: "Family", icon: Users },
  addiction: { label: "Addiction", icon: AlertTriangle },
  other: { label: "Other", icon: CircleDot },
};

const STATUS_STYLE: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "Open", color: "text-primary-bright bg-primary/10", icon: CircleDot },
  "follow-up": { label: "Follow-up", color: "text-gold bg-gold/10", icon: Clock },
  closed: { label: "Closed", color: "text-success bg-success/10", icon: CheckCircle2 },
};

export function CounselingPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [rows, mem] = await Promise.all([
      db.rawQuery(
        `SELECT cs.*, p.first_name AS member_first, p.last_name AS member_last, u.name AS counselor_name
         FROM counseling_session cs
         LEFT JOIN person p ON cs.person_id = p.id
         LEFT JOIN user u ON cs.counselor_id = u.id
         WHERE cs.church_id = ? ORDER BY cs.date DESC LIMIT 500`,
        [cid]
      ),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name ASC, last_name ASC", [cid]),
    ]);
    setSessions(rows);
    setMembers(mem);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = sessions;
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.summary?.toLowerCase().includes(q) || `${s.member_first || ""} ${s.member_last || ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, search, statusFilter]);

  const stats = useMemo(() => ({
    total: sessions.length,
    open: sessions.filter((s) => s.status === "open").length,
    followUp: sessions.filter((s) => s.status === "follow-up").length,
    overdue: sessions.filter((s) => s.follow_up_date && s.status !== "closed" && new Date(s.follow_up_date) < new Date()).length,
  }), [sessions]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this counseling session?")) return;
    setBusyId(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    showToast("Session deleted");
    await db.delete("counseling_session", id);
    setBusyId(null);
  }

  async function handleClose(id: string) {
    setBusyId(id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, status: "closed" } : s));
    await db.update("counseling_session", id, { status: "closed" });
    showToast("Session closed");
    setBusyId(null);
  }

  return (
    <PageShell title="Counseling">
      <PageHeader title="Counseling & pastoral care" description="Confidential log of counseling sessions and follow-ups.">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Session
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sessions" value={stats.total} icon={Heart} color="text-primary-bright" />
        <StatCard label="Open" value={stats.open} icon={CircleDot} color="text-primary-bright" />
        <StatCard label="Follow-up" value={stats.followUp} icon={Clock} color="text-gold" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} color="text-danger" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search sessions..." />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input h-9 w-40 text-sm">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="follow-up">Follow-up</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Heart className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || statusFilter !== "all" ? "No sessions match" : "No counseling sessions yet"}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => {
            const typeCfg = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.other;
            const statusCfg = STATUS_STYLE[s.status] ?? STATUS_STYLE.open;
            const TypeIcon = typeCfg.icon;
            const StatusIcon = statusCfg.icon;
            const memberName = s.member_first ? `${s.member_first} ${s.member_last}` : null;
            const isOverdue = s.follow_up_date && s.status !== "closed" && new Date(s.follow_up_date) < new Date();
            return (
              <div key={s.id} className={cn("card p-4", busyId === s.id && "opacity-50")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="size-4 text-ink-muted" />
                    <span className="text-xs font-medium text-ink-muted">{typeCfg.label}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", statusCfg.color)}>
                      <StatusIcon className="size-3" /> {statusCfg.label}
                    </span>
                    {!!s.confidential && <span title="Confidential"><Shield className="size-3.5 text-danger" /></span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(s); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-4" /></button>
                    {s.status !== "closed" && (
                      <button onClick={() => handleClose(s.id)} disabled={busyId === s.id} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-success/10 hover:text-success disabled:pointer-events-none" title="Close">
                        {busyId === s.id ? <Loader2 className="size-4 whq-spin" /> : <CheckCircle2 className="size-4" />}
                      </button>
                    )}
                    <button onClick={() => handleDelete(s.id)} disabled={busyId === s.id} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
                      {busyId === s.id ? <Loader2 className="size-4 whq-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">{s.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                  {memberName && <span>Member: {memberName}</span>}
                  {s.counselor_name && <span>Counselor: {s.counselor_name}</span>}
                  <span>{formatDate(s.date)}</span>
                  {s.follow_up_date && <span className={isOverdue ? "font-semibold text-danger" : ""}>Follow-up: {formatDate(s.follow_up_date)} {isOverdue ? "(overdue)" : ""}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Session" : "Log counseling session"}>
        <CounselingForm churchId={session!.churchId} counselorId={session!.userId} members={members} existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function CounselingForm({ churchId, counselorId, members, existing, onClose, onSaved }: {
  churchId: string; counselorId: string; members: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: existing?.type || "general",
    person_id: existing?.person_id || "",
    summary: existing?.summary || "",
    notes: existing?.notes || "",
    status: existing?.status || "open",
    confidential: existing ? !!existing.confidential : true,
    date: existing?.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    follow_up_date: existing?.follow_up_date ? existing.follow_up_date.slice(0, 10) : "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.summary.trim()) return;
    setSaving(true);
    const data = {
      type: form.type, person_id: form.person_id || null,
      summary: form.summary.trim(), notes: form.notes || null,
      status: form.status, confidential: form.confidential ? 1 : 0,
      date: new Date(form.date).toISOString(),
      follow_up_date: form.follow_up_date ? new Date(form.follow_up_date).toISOString() : null,
    };
    if (existing) {
      await db.update("counseling_session", existing.id, data);
      showToast("Session updated");
    } else {
      await db.insert("counseling_session", {
        id: uuid(), church_id: churchId,
        counselor_id: counselorId && counselorId !== "demo" && counselorId !== "superadmin" ? counselorId : null,
        ...data,
      });
      showToast("Session recorded");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">
            {Object.entries(TYPE_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Member</label>
          <select value={form.person_id} onChange={set("person_id")} className="input">
            <option value="">— None —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
          <select value={form.status} onChange={set("status")} className="input">
            <option value="open">Open</option>
            <option value="follow-up">Follow-up</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Follow-up date</label><input type="date" value={form.follow_up_date} onChange={set("follow_up_date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Summary *</label><textarea value={form.summary} onChange={set("summary")} className="input" rows={2} required placeholder="Brief summary of the session..." /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes (confidential)</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} placeholder="Detailed notes..." /></div>
      <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
        <input type="checkbox" checked={form.confidential} onChange={(e) => setForm((f) => ({ ...f, confidential: e.target.checked }))} className="rounded border-line accent-primary" />
        Mark as confidential
      </label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Save"}</button>
      </div>
    </form>
  );
}
