import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Users, Baby, GraduationCap, Search, Trash2, Pencil,
  Grid3X3, List, Phone, BookOpen, User, ChevronRight, X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { Lightbox } from "../components/ui/Lightbox";
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
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<any>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total" value={stats.total} icon={Users} color="text-primary-bright" />
        <StatCard label="Children" value={stats.children} icon={Baby} color="text-success" />
        <StatCard label="Teens" value={stats.teens} icon={GraduationCap} color="text-gold" />
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
        <div className="flex items-center gap-2 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9 text-sm" placeholder="Search children..." />
          </div>
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button onClick={() => setView("list")}
              className={cn("grid size-9 place-items-center", view === "list" ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-2")}>
              <List className="size-4" />
            </button>
            <button onClick={() => setView("grid")}
              className={cn("grid size-9 place-items-center", view === "grid" ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-2")}>
              <Grid3X3 className="size-4" />
            </button>
          </div>
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
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-line">
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
                <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer hover:bg-surface-2/50">
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
                    <ChevronRight className="size-4 text-ink-faint" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const name = `${p.first_name} ${p.last_name}`;
            return (
              <div key={p.id} onClick={() => setSelected(p)}
                className="group cursor-pointer rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md">
                <div className="flex flex-col items-center text-center">
                  <Avatar name={name} src={p.photo_url} size="lg" />
                  <h3 className="mt-3 text-sm font-semibold text-ink">{name}</h3>
                  <span className={cn("mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize",
                    p.age_group === "teen" ? "bg-gold/10 text-gold" : "bg-info/10 text-info"
                  )}>{p.age_group}</span>
                  <p className="mt-1 text-xs text-ink-faint">{parentName(p) ?? p.guardian_name ?? "---"}</p>
                  {p.school && <p className="text-xs text-ink-muted">{p.school}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Drawer */}
      {selected && createPortal(
        <>
          <div className="drawer-overlay" onClick={() => setSelected(null)} />
          <div className="drawer">
            <div className="relative bg-gradient-to-br from-primary/8 via-surface to-surface px-6 pb-4 pt-6">
              <button onClick={() => setSelected(null)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2">
                <X className="size-5" />
              </button>
              <div className="flex items-center gap-4">
                <div onClick={() => selected.photo_url && setLightboxSrc(selected.photo_url)}
                  className={selected.photo_url ? "cursor-zoom-in" : ""}>
                  <Avatar name={`${selected.first_name} ${selected.last_name}`} src={selected.photo_url} size="xl" className="ring-4 ring-surface" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-ink">{selected.first_name} {selected.last_name}</h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize",
                    selected.age_group === "teen" ? "bg-gold/10 text-gold" : "bg-info/10 text-info"
                  )}>{selected.age_group}</span>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
              <div className="mt-4 space-y-1">
                {selected.phone && <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm"><span className="grid size-8 place-items-center rounded-lg bg-surface-2/60"><Phone className="size-3.5 text-ink-faint" /></span><span className="text-ink-muted">{selected.phone}</span></div>}
                {selected.date_of_birth && <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm"><span className="grid size-8 place-items-center rounded-lg bg-surface-2/60"><User className="size-3.5 text-ink-faint" /></span><span className="text-ink-muted">Born: {formatDate(selected.date_of_birth)}</span></div>}
                {selected.school && <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm"><span className="grid size-8 place-items-center rounded-lg bg-surface-2/60"><BookOpen className="size-3.5 text-ink-faint" /></span><span className="text-ink-muted">{selected.school}{selected.grade ? ` · ${selected.grade}` : ""}</span></div>}
              </div>
              {(parentName(selected) || selected.guardian_name) && (
                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Parent / Guardian</h3>
                  <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-sm">
                    <div className="font-medium">{parentName(selected) ?? selected.guardian_name}</div>
                    {selected.guardian_phone && <div className="mt-1 text-ink-muted">{selected.guardian_phone}</div>}
                  </div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => { setEditing(selected); setShowForm(true); setSelected(null); }} className="btn-primary flex-1 btn-sm"><Pencil className="size-3.5" /> Edit</button>
                <button onClick={() => { handleDelete(selected); setSelected(null); }} className="btn-danger btn-sm px-3"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}

      {lightboxSrc && <Lightbox src={lightboxSrc} alt="Child photo" onClose={() => setLightboxSrc(null)} />}

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
