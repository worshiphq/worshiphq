import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, CheckCircle2, Circle, Clock, Trash2, Search,
  UserRoundPlus, UserPlus, Heart, ListTodo, Calendar, User, Pencil, AlertCircle,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const TYPE_META: Record<string, { icon: any; label: string }> = {
  new_visitor: { icon: UserRoundPlus, label: "Visitor" },
  new_member: { icon: UserPlus, label: "New member" },
  pastoral: { icon: Heart, label: "Pastoral" },
  custom: { icon: ListTodo, label: "Task" },
};

const STATUS_META: Record<string, { icon: any; label: string; color: string }> = {
  open: { icon: Circle, label: "Open", color: "text-gold" },
  in_progress: { icon: Clock, label: "In progress", color: "text-info" },
  done: { icon: CheckCircle2, label: "Done", color: "text-success" },
};

export function FollowUpsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [rows, u] = await Promise.all([
      db.rawQuery(
        `SELECT f.*,
                p.first_name AS person_first, p.last_name AS person_last,
                v.first_name AS visitor_first, v.last_name AS visitor_last,
                u.name AS assignee_name
         FROM follow_up f
         LEFT JOIN person p ON f.person_id = p.id
         LEFT JOIN visitor v ON f.visitor_id = v.id
         LEFT JOIN user u ON f.assignee_id = u.id
         WHERE f.church_id = ?
         ORDER BY f.status ASC, f.due_date ASC, f.created_at DESC LIMIT 500`,
        [cid]
      ),
      db.rawQuery("SELECT id, name FROM user WHERE church_id = ? ORDER BY name ASC", [cid]),
    ]);
    setFollowUps(rows);
    setUsers(u);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = followUps;
    if (filter === "open") list = list.filter((f) => f.status !== "done");
    if (filter === "done") list = list.filter((f) => f.status === "done");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) =>
        f.title?.toLowerCase().includes(q) ||
        `${f.person_first || ""} ${f.person_last || ""}`.toLowerCase().includes(q) ||
        `${f.visitor_first || ""} ${f.visitor_last || ""}`.toLowerCase().includes(q) ||
        f.assignee_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [followUps, search, filter]);

  const stats = useMemo(() => {
    const open = followUps.filter((f) => f.status !== "done").length;
    const done = followUps.filter((f) => f.status === "done").length;
    const overdue = followUps.filter((f) => f.status !== "done" && f.due_date && new Date(f.due_date) < new Date()).length;
    return { total: followUps.length, open, done, overdue };
  }, [followUps]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this follow-up?")) return;
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    showToast("Deleted");
    await db.delete("follow_up", id);
  }

  async function cycleStatus(f: any) {
    const next = f.status === "done" ? "open" : f.status === "open" ? "in_progress" : "done";
    setFollowUps((prev) => prev.map((p) => p.id === f.id ? { ...p, status: next } : p));
    await db.update("follow_up", f.id, { status: next, completed_at: next === "done" ? new Date().toISOString() : null });
    showToast(next === "done" ? "Marked done" : next === "in_progress" ? "In progress" : "Reopened");
  }

  return (
    <PageShell title="Follow-ups">
      <PageHeader title="Follow-ups" description="Track pastoral care, visitor follow-ups, and tasks for your team.">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Follow-up
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} icon={ListTodo} color="text-primary-bright" />
        <StatCard label="Active" value={stats.open} icon={Clock} color="text-gold" />
        <StatCard label="Done" value={stats.done} icon={CheckCircle2} color="text-success" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} color="text-danger" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-10 pl-9" placeholder="Search follow-ups..." />
        </div>
        <div className="flex gap-1">
          {(["all", "open", "done"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
              {f === "all" ? "All" : f === "open" ? "Active" : "Done"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || filter !== "all" ? "No matching follow-ups" : "No follow-ups yet"}</p>
          <p className="mt-1 text-xs text-ink-muted">They're auto-created when visitors are added.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const typeMeta = TYPE_META[f.type] ?? TYPE_META.custom;
            const statusMeta = STATUS_META[f.status] ?? STATUS_META.open;
            const TypeIcon = typeMeta.icon;
            const StatusIcon = statusMeta.icon;
            const isOverdue = f.status !== "done" && f.due_date && new Date(f.due_date) < new Date();
            const linkedName = (f.visitor_first && `${f.visitor_first} ${f.visitor_last}`) || (f.person_first && `${f.person_first} ${f.person_last}`);
            return (
              <div key={f.id} className={cn("card p-4 flex items-start gap-3", isOverdue && "border-danger/30")}>
                <button onClick={() => cycleStatus(f)} className="mt-0.5 shrink-0" title={`Mark as ${f.status === "done" ? "open" : f.status === "open" ? "in progress" : "done"}`}>
                  <StatusIcon className={cn("size-5", statusMeta.color)} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm font-medium", f.status === "done" ? "text-ink-muted line-through" : "text-ink")}>{f.title}</span>
                    <span className="badge badge-muted text-[10px] gap-1">
                      <TypeIcon className="size-3" /> {typeMeta.label}
                    </span>
                    {isOverdue && <span className="badge badge-danger text-[10px]">Overdue</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                    {linkedName && <span className="flex items-center gap-1"><User className="size-3" /> {linkedName}</span>}
                    {f.assignee_name && <span>Assigned to {f.assignee_name}</span>}
                    {f.due_date && <span className={cn("flex items-center gap-1", isOverdue && "text-danger font-medium")}><Calendar className="size-3" /> Due {formatDate(f.due_date)}</span>}
                  </div>
                  {f.note && <p className="mt-1 text-xs text-ink-faint italic">{f.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => { setEditing(f); setShowForm(true); }} className="rounded-lg p-1.5 text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-4" /></button>
                  <button onClick={() => handleDelete(f.id)} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Follow-up" : "New Follow-up"}>
        <FollowUpForm churchId={session!.churchId} users={users} existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function FollowUpForm({ churchId, users, existing, onClose, onSaved }: {
  churchId: string; users: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "", type: existing?.type || "custom",
    note: existing?.note || "", assignee_id: existing?.assignee_id || "",
    due_date: existing?.due_date ? existing.due_date.slice(0, 10) : "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const data = {
      title: form.title.trim(), type: form.type,
      note: form.note || null, assignee_id: form.assignee_id || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
    };
    if (existing) {
      await db.update("follow_up", existing.id, data);
      showToast("Follow-up updated");
    } else {
      await db.insert("follow_up", { id: uuid(), church_id: churchId, ...data, status: "open" });
      showToast("Follow-up created");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="Call visitor John" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">
            <option value="new_visitor">Visitor</option>
            <option value="new_member">New member</option>
            <option value="pastoral">Pastoral</option>
            <option value="custom">Task</option>
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Due Date</label><input type="date" value={form.due_date} onChange={set("due_date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Assign to</label>
        <select value={form.assignee_id} onChange={set("assignee_id")} className="input">
          <option value="">— Unassigned —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Note</label><textarea value={form.note} onChange={set("note")} className="input" rows={2} placeholder="Additional details..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Create"}</button>
      </div>
    </form>
  );
}
