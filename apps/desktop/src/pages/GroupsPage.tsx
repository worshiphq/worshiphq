import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Users2, Trash2, Search, MapPin, Calendar, User, Pencil,
  UserPlus, X, ArrowLeft, Phone,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const GROUP_TYPES = [
  { value: "small_group", label: "Small group" },
  { value: "ministry", label: "Ministry" },
  { value: "committee", label: "Committee" },
  { value: "fellowship", label: "Fellowship" },
];
const TYPE_LABELS: Record<string, string> = Object.fromEntries(GROUP_TYPES.map((t) => [t.value, t.label]));
const MEETING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function GroupsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [groups, setGroups] = useState<any[]>([]);
  const [members, setMembers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const [g, gm] = await Promise.all([
      db.rawQuery(
        `SELECT g.*, p.first_name AS leader_first, p.last_name AS leader_last
         FROM "group" g LEFT JOIN person p ON g.leader_id = p.id
         WHERE g.church_id = ? ORDER BY g.name ASC`,
        [session!.churchId]
      ),
      db.rawQuery("SELECT group_id, COUNT(*) as cnt FROM group_member GROUP BY group_id", []),
    ]);
    setGroups(g);
    const counts: Record<string, number> = {};
    for (const row of gm) counts[row.group_id] = row.cnt;
    setMembers(counts);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name?.toLowerCase().includes(q) || g.type?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));
  }, [groups, search]);

  const stats = useMemo(() => {
    const totalMembers = Object.values(members).reduce((a, b) => a + b, 0);
    return { total: groups.length, totalMembers };
  }, [groups, members]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete group "${name}"?`)) return;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    showToast("Group deleted");
    await db.delete("group", id);
  }

  return (
    <PageShell title="Groups">
      <PageHeader title="Groups" description="Manage small groups, ministries, committees, and fellowships.">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Group
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Groups" value={stats.total} icon={Users2} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Total Members" value={stats.totalMembers} icon={User} color="bg-success/10 text-success" />
        <StatCard label="Avg Size" value={stats.total ? Math.round(stats.totalMembers / stats.total) : 0} icon={Users2} color="bg-info/10 text-info" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search groups..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Users2 className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No groups match your search" : "No groups yet"}</p>
          <p className="mt-1 text-xs text-ink-muted">Create your first group to organize members.</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {filtered.map((g) => {
            const memberCount = members[g.id] || 0;
            const leaderName = g.leader_first ? `${g.leader_first} ${g.leader_last}` : null;
            return (
              <div key={g.id} onClick={() => setDetailId(g.id)} className="card p-4 hover:shadow-lg transition-shadow cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary-soft"><Users2 className="size-5 text-primary-bright" /></div>
                    <div>
                      <h3 className="font-bold text-ink">{g.name}</h3>
                      <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{TYPE_LABELS[g.type] ?? g.type}</span>
                      {g.is_active === 0 && <span className="ml-1 rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-faint">Inactive</span>}
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditing(g); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                    <button onClick={() => handleDelete(g.id, g.name)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
                {g.description && <p className="mt-2 text-xs text-ink-muted line-clamp-2">{g.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-faint">
                  <span className="flex items-center gap-1"><User className="size-3" /> {memberCount} member{memberCount !== 1 ? "s" : ""}</span>
                  {leaderName && <span className="flex items-center gap-1"><User className="size-3" /> {leaderName}</span>}
                  {g.meeting_day && <span className="flex items-center gap-1"><Calendar className="size-3" /> {g.meeting_day} {g.meeting_time && `at ${g.meeting_time}`}</span>}
                  {g.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {g.location}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Group" : "Create Group"}>
        <GroupForm churchId={session!.churchId} existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>

      {detailId && (
        <GroupDetailDrawer churchId={session!.churchId} groupId={detailId}
          onClose={() => { setDetailId(null); loadData(); }} />
      )}
    </PageShell>
  );
}

function GroupForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: existing?.name || "", type: existing?.type || "small_group",
    description: existing?.description || "",
    meeting_day: existing?.meeting_day || "", meeting_time: existing?.meeting_time || "",
    location: existing?.location || "", leader_id: existing?.leader_id || "",
    is_active: existing ? existing.is_active !== 0 : true,
  });

  useEffect(() => {
    db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name", [churchId]).then(setPeople);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const data = {
      name: form.name.trim(), type: form.type, description: form.description || null,
      meeting_day: form.meeting_day || null, meeting_time: form.meeting_time || null,
      location: form.location || null, leader_id: form.leader_id || null,
      is_active: form.is_active ? 1 : 0,
    };
    if (existing) {
      await db.update("group", existing.id, data);
      showToast("Group updated");
    } else {
      await db.insert("group", { id: uuid(), church_id: churchId, ...data });
      showToast("Group created");
    }
    setSaving(false); onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Group Name *</label><input value={form.name} onChange={set("name")} className="input" placeholder="e.g. Youth Fellowship" required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">{GROUP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Leader</label>
          <select value={form.leader_id} onChange={set("leader_id")} className="input">
            <option value="">— None —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
        </div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Description</label><textarea value={form.description} onChange={set("description")} className="input" rows={2} placeholder="Brief description..." /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Meeting Day</label>
          <select value={form.meeting_day} onChange={set("meeting_day")} className="input">
            <option value="">— None —</option>
            {MEETING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Meeting Time</label><input type="time" value={form.meeting_time} onChange={set("meeting_time")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Location</label><input value={form.location} onChange={set("location")} className="input" placeholder="Room/venue" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-line accent-primary" />
        Active group
      </label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update Group" : "Create Group"}</button>
      </div>
    </form>
  );
}

/* ─── Group detail drawer: member management ─── */
function GroupDetailDrawer({ churchId, groupId, onClose }: { churchId: string; groupId: string; onClose: () => void }) {
  const { showToast } = useAppStore();
  const [group, setGroup] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadDetail(); }, [groupId]);

  async function loadDetail() {
    setLoading(true);
    const [g, mem, all] = await Promise.all([
      db.rawQuery(
        `SELECT g.*, p.first_name AS leader_first, p.last_name AS leader_last, p.phone AS leader_phone
         FROM "group" g LEFT JOIN person p ON g.leader_id = p.id WHERE g.id = ?`,
        [groupId]
      ),
      db.rawQuery(
        `SELECT p.id, p.first_name, p.last_name, p.phone, p.photo_url
         FROM group_member gm JOIN person p ON gm.person_id = p.id
         WHERE gm.group_id = ? ORDER BY p.first_name ASC, p.last_name ASC`,
        [groupId]
      ),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name ASC, last_name ASC LIMIT 500", [churchId]),
    ]);
    setGroup(g[0] || null);
    setMembers(mem);
    const memberIds = new Set(mem.map((m: any) => m.id));
    setAvailable(all.filter((p: any) => !memberIds.has(p.id)));
    setLoading(false);
  }

  async function handleAdd(personId: string) {
    setBusy(true);
    await db.rawQuery("INSERT OR IGNORE INTO group_member (group_id, person_id) VALUES (?, ?)", [groupId, personId]);
    showToast("Member added");
    await loadDetail();
    setBusy(false);
  }

  async function handleRemove(personId: string) {
    setBusy(true);
    await db.rawQuery("DELETE FROM group_member WHERE group_id = ? AND person_id = ?", [groupId, personId]);
    showToast("Member removed");
    await loadDetail();
    setBusy(false);
  }

  const filteredMembers = members.filter((m) => !search || `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()));
  const filteredAvailable = available.filter((p) => !addSearch || `${p.first_name} ${p.last_name}`.toLowerCase().includes(addSearch.toLowerCase())).slice(0, 20);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className={cn("drawer", busy && "opacity-70")}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><ArrowLeft className="size-5" /></button>
          <div className="flex-1 min-w-0">
            {group ? (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-ink">{group.name}</h2>
                  <span className="badge badge-muted">{TYPE_LABELS[group.type] ?? group.type}</span>
                </div>
                {group.description && <p className="mt-0.5 text-xs text-ink-muted">{group.description}</p>}
              </>
            ) : <span className="text-sm text-ink-muted">Loading...</span>}
          </div>
        </div>

        <div className="p-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 80px)" }}>
          {loading || !group ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
          ) : (
            <>
              <div className="mb-5 grid gap-3 grid-cols-1">
                {group.leader_first && (
                  <div className="card flex items-center gap-3 p-3">
                    <User className="size-4 text-primary-bright" />
                    <div><p className="text-xs text-ink-muted">Leader</p><p className="text-sm font-medium text-ink">{group.leader_first} {group.leader_last}{group.leader_phone && <span className="ml-2 text-xs text-ink-faint">{group.leader_phone}</span>}</p></div>
                  </div>
                )}
                {group.meeting_day && (
                  <div className="card flex items-center gap-3 p-3">
                    <Calendar className="size-4 text-primary-bright" />
                    <div><p className="text-xs text-ink-muted">Meets</p><p className="text-sm font-medium text-ink">{group.meeting_day}{group.meeting_time ? ` at ${group.meeting_time}` : ""}</p></div>
                  </div>
                )}
                {group.location && (
                  <div className="card flex items-center gap-3 p-3">
                    <MapPin className="size-4 text-primary-bright" />
                    <div><p className="text-xs text-ink-muted">Location</p><p className="text-sm font-medium text-ink">{group.location}</p></div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Users2 className="size-4" /> Members ({members.length})</h3>
                <button className="btn-secondary btn-sm" onClick={() => setShowAdd(!showAdd)}>
                  {showAdd ? <X className="size-4" /> : <UserPlus className="size-4" />}{showAdd ? "Close" : "Add member"}
                </button>
              </div>

              {showAdd && (
                <div className="card mt-3 p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} autoFocus className="input h-9 pl-9" placeholder="Search members to add..." />
                  </div>
                  {filteredAvailable.length === 0 ? (
                    <p className="mt-3 text-center text-xs text-ink-muted">No members available to add.</p>
                  ) : (
                    <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                      {filteredAvailable.map((p) => (
                        <button key={p.id} onClick={() => handleAdd(p.id)} disabled={busy}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2 disabled:opacity-50">
                          <UserPlus className="size-3.5 text-primary-bright" /> {p.first_name} {p.last_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                {members.length > 5 && (
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search members..." />
                  </div>
                )}
                {filteredMembers.length === 0 ? (
                  <div className="card p-8 text-center">
                    <Users2 className="mx-auto size-8 text-ink-faint/30" />
                    <p className="mt-2 text-sm text-ink-muted">No members in this group yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
                        <Avatar name={`${m.first_name} ${m.last_name}`} src={m.photo_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{m.first_name} {m.last_name}</p>
                          {m.phone && <p className="text-xs text-ink-muted flex items-center gap-1"><Phone className="size-3" />{m.phone}</p>}
                        </div>
                        {group.leader_id === m.id && <span className="badge badge-muted text-[10px]">Leader</span>}
                        <button onClick={() => handleRemove(m.id)} disabled={busy} className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-50" title="Remove from group"><X className="size-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
