import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Users, Baby, GraduationCap, Search, Trash2, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const SEGMENTS = [
  { key: "all", label: "All" },
  { key: "child", label: "Children" },
  { key: "teen", label: "Teens" },
] as const;

export function ChildrenPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [adults, setAdults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [kids, grownups] = await Promise.all([
      db.rawQuery(
        `SELECT c.*, p.first_name AS parent_first, p.last_name AS parent_last
         FROM person c LEFT JOIN person p ON c.parent_id = p.id
         WHERE c.church_id = ? AND c.age_group IN ('child','teen')
         ORDER BY c.first_name ASC`, [cid]),
      db.rawQuery(
        `SELECT id, first_name, last_name FROM person
         WHERE church_id = ? AND (age_group IS NULL OR age_group = 'adult')
         ORDER BY first_name ASC LIMIT 500`, [cid]),
    ]);
    setPeople(kids);
    setAdults(grownups);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (segment !== "all" && p.age_group !== segment) return false;
      if (search) {
        const q = search.toLowerCase();
        const full = `${p.first_name} ${p.last_name}`.toLowerCase();
        return full.includes(q) || (p.school ?? "").toLowerCase().includes(q) ||
          (p.guardian_name ?? "").toLowerCase().includes(q) ||
          `${p.parent_first ?? ""} ${p.parent_last ?? ""}`.toLowerCase().includes(q);
      }
      return true;
    });
  }, [people, search, segment]);

  const stats = useMemo(() => {
    const children = people.filter((p) => p.age_group === "child").length;
    const teens = people.filter((p) => p.age_group === "teen").length;
    return { total: people.length, children, teens };
  }, [people]);

  async function handleDelete(p: any) {
    if (!confirm(`Remove ${p.first_name} ${p.last_name}? This cannot be undone.`)) return;
    setPeople((prev) => prev.filter((x) => x.id !== p.id));
    showToast("Removed");
    await db.delete("person", p.id);
  }

  const parentName = (p: any) => (p.parent_first ? `${p.parent_first} ${p.parent_last}` : null);

  return (
    <PageShell title="Children & Teens">
      <PageHeader title="Children & Teens" description="Manage children and teens separately from adults. Assign parents and track school info.">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Child
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total" value={stats.total} icon={Users} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Children" value={stats.children} icon={Baby} color="bg-success/10 text-success" />
        <StatCard label="Teens" value={stats.teens} icon={GraduationCap} color="bg-gold/10 text-gold" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {SEGMENTS.map((s) => (
            <button key={s.key} onClick={() => setSegment(s.key)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                segment === s.key ? "bg-primary-soft text-primary-bright" : "text-ink-muted hover:bg-surface-2"
              )}>{s.label}</button>
          ))}
        </div>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search children..." />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Baby className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{people.length ? "No results" : "No children or teens yet"}</p>
          <p className="mt-1 text-xs text-ink-faint">{search ? `No one matches "${search}".` : "Add children and teens to track them separately from adult members."}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Age Group</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Parent / Guardian</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">School</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="xs" />
                      <div>
                        <div className="font-medium text-ink">{p.first_name} {p.last_name}</div>
                        <div className="text-[11px] text-ink-faint">{p.member_id || "---"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize",
                      p.age_group === "teen" ? "bg-gold/10 text-gold" : "bg-info/10 text-info"
                    )}>{p.age_group}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{parentName(p) ?? p.guardian_name ?? "---"}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.school ? `${p.school}${p.grade ? ` · ${p.grade}` : ""}` : "---"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(p); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                      <button onClick={() => handleDelete(p)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit child / teen" : "Add child / teen"}>
        <ChildForm churchId={session!.churchId} adults={adults} existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function ChildForm({ churchId, adults, existing, onClose, onSaved }: {
  churchId: string; adults: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: existing?.first_name || "", last_name: existing?.last_name || "",
    age_group: existing?.age_group || "child", gender: existing?.gender || "",
    date_of_birth: existing?.date_of_birth?.slice(0, 10) || "", phone: existing?.phone || "",
    school: existing?.school || "", grade: existing?.grade || "",
    parent_id: existing?.parent_id || "", guardian_name: existing?.guardian_name || "",
    guardian_phone: existing?.guardian_phone || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function birthdayFrom(dob: string): string | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    setSaving(true);
    const data: any = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      age_group: form.age_group, gender: form.gender || null,
      date_of_birth: form.date_of_birth || null, birthday: birthdayFrom(form.date_of_birth),
      phone: form.phone.trim() || null, school: form.school.trim() || null,
      grade: form.grade.trim() || null, parent_id: form.parent_id || null,
      guardian_name: form.guardian_name.trim() || null, guardian_phone: form.guardian_phone.trim() || null,
    };
    if (existing) {
      await db.update("person", existing.id, data);
      showToast("Changes saved");
    } else {
      await db.insert("person", { id: uuid(), church_id: churchId, ...data, status: "active" });
      showToast("Child added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">First name *</label><input value={form.first_name} onChange={set("first_name")} className="input" required /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Last name *</label><input value={form.last_name} onChange={set("last_name")} className="input" required /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Age group *</label>
          <select value={form.age_group} onChange={set("age_group")} className="input">
            <option value="child">Child (under 13)</option>
            <option value="teen">Teen (13–17)</option>
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Gender</label>
          <select value={form.gender} onChange={set("gender")} className="input">
            <option value="">—</option><option value="Male">Male</option><option value="Female">Female</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date of birth</label><input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Phone (optional)</label><input value={form.phone} onChange={set("phone")} className="input" placeholder="For teens" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">School</label><input value={form.school} onChange={set("school")} className="input" placeholder="e.g. Accra Academy" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Grade / Class</label><input value={form.grade} onChange={set("grade")} className="input" placeholder="e.g. JHS 2" /></div>
      </div>

      <div className="border-t border-line pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Parent / Guardian</h3>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Assign parent (church member)</label>
          <select value={form.parent_id} onChange={set("parent_id")} className="input">
            <option value="">— Select a member —</option>
            {adults.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-ink-faint">Links this child to an existing adult member record.</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-ink-muted mb-1">Or guardian name</label><input value={form.guardian_name} onChange={set("guardian_name")} className="input" placeholder="Full name" /></div>
          <div><label className="block text-xs font-medium text-ink-muted mb-1">Guardian phone</label><input value={form.guardian_phone} onChange={set("guardian_phone")} className="input" placeholder="e.g. 0244123456" /></div>
        </div>
      </div>

      <div className="flex gap-2 border-t border-line pt-3">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Save changes" : "Add child"}</button>
      </div>
    </form>
  );
}
