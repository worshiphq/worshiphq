import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Users2, Trash2, Search, MapPin, Calendar, User,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const GROUP_TYPES = ["Fellowship", "Prayer", "Bible Study", "Ministry", "Youth", "Outreach", "Other"];
const MEETING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function GroupsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [groups, setGroups] = useState<any[]>([]);
  const [members, setMembers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const [g, gm] = await Promise.all([
      db.rawQuery('SELECT * FROM "group" WHERE church_id = ? ORDER BY name ASC', [session!.churchId]),
      db.rawQuery('SELECT group_id, COUNT(*) as cnt FROM group_member GROUP BY group_id', []),
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
    return groups.filter((g) =>
      g.name?.toLowerCase().includes(q) || g.type?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
    );
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
      <PageHeader title="Groups" description="Manage cell groups, fellowships, and ministry teams.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Group
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Groups" value={stats.total} icon={Users2} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Total Members" value={stats.totalMembers} icon={User} color="bg-success/10 text-success" />
        <StatCard label="Avg Size" value={stats.total ? Math.round(stats.totalMembers / stats.total) : 0} icon={Users2} color="bg-info/10 text-info" />
      </div>

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search groups..." />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-primary-bright whq-spin" />
        </div>
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
            return (
              <div key={g.id} className="card p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary-soft">
                      <Users2 className="size-5 text-primary-bright" />
                    </div>
                    <div>
                      <h3 className="font-bold text-ink">{g.name}</h3>
                      {g.type && (
                        <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                          {g.type}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(g.id, g.name)}
                    className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {g.description && (
                  <p className="mt-2 text-xs text-ink-muted line-clamp-2">{g.description}</p>
                )}

                <div className="mt-3 flex items-center gap-4 text-xs text-ink-faint">
                  <span className="flex items-center gap-1">
                    <User className="size-3" /> {memberCount} member{memberCount !== 1 ? "s" : ""}
                  </span>
                  {g.meeting_day && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" /> {g.meeting_day} {g.meeting_time && `at ${g.meeting_time}`}
                    </span>
                  )}
                  {g.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" /> {g.location}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Group">
        <GroupForm
          churchId={session!.churchId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      </Modal>
    </PageShell>
  );
}

function GroupForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "", type: "Fellowship", description: "",
    meeting_day: "", meeting_time: "", location: "", leader_id: "",
  });

  useEffect(() => {
    db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name", [churchId]).then(setPeople);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await db.insert("group", {
      id: uuid(), church_id: churchId, name: form.name.trim(),
      type: form.type, description: form.description || null,
      meeting_day: form.meeting_day || null, meeting_time: form.meeting_time || null,
      location: form.location || null, leader_id: form.leader_id || null,
    });
    showToast("Group created");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Group Name *</label>
        <input value={form.name} onChange={set("name")} className="input" placeholder="e.g. Zone 1 Fellowship" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">
            {GROUP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Leader</label>
          <select value={form.leader_id} onChange={set("leader_id")} className="input">
            <option value="">— None —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Description</label>
        <textarea value={form.description} onChange={set("description")} className="input" rows={2} placeholder="What this group is about..." />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Meeting Day</label>
          <select value={form.meeting_day} onChange={set("meeting_day")} className="input">
            <option value="">— None —</option>
            {MEETING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Meeting Time</label>
          <input type="time" value={form.meeting_time} onChange={set("meeting_time")} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Location</label>
          <input value={form.location} onChange={set("location")} className="input" placeholder="Room/venue" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Creating..." : "Create Group"}
        </button>
      </div>
    </form>
  );
}
