import { useEffect, useState, useMemo } from "react";
import {
  Search, Plus, Loader2, Trash2, Edit3, X, Users, User,
  Grid3X3, List, Phone, Mail, MapPin, Briefcase, Heart,
  ChevronRight, ArrowDownAZ, GraduationCap, Baby, MessageSquare,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal, Drawer } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn, formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

type AgeTab = "adult" | "teen" | "child";
type Segment = "all" | "active" | "visitor" | "inactive";
type ViewMode = "list" | "grid";
type SortBy = "name-az" | "name-za" | "newest" | "oldest";

const ageGroupTabs = [
  { key: "adult" as const, label: "Adults", icon: Users },
  { key: "teen" as const, label: "Teens", icon: GraduationCap },
  { key: "child" as const, label: "Children", icon: Baby },
];

const segments: { key: Segment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "visitor", label: "Visitors" },
  { key: "inactive", label: "Inactive" },
];

export function PeoplePage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ageTab, setAgeTab] = useState<AgeTab>("adult");
  const [segment, setSegment] = useState<Segment>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortBy>("name-az");
  const [deptFilter, setDeptFilter] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) {
      loadPeople();
      loadDepartments();
    }
  }, [session?.churchId, syncVersion]);

  async function loadPeople() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM person WHERE church_id = ? ORDER BY first_name, last_name",
      [session!.churchId]
    );
    setPeople(rows);
    setLoading(false);
  }

  async function loadDepartments() {
    const rows = await db.rawQuery(
      "SELECT * FROM department WHERE church_id = ? ORDER BY name",
      [session!.churchId]
    );
    setDepartments(rows);
  }

  const stats = useMemo(() => ({
    total: people.length,
    adults: people.filter((p) => (p.age_group || "adult") === "adult").length,
    teens: people.filter((p) => p.age_group === "teen").length,
    children: people.filter((p) => p.age_group === "child").length,
    departments: departments.length,
  }), [people, departments]);

  const filtered = useMemo(() => {
    let list = people.filter((p) => {
      const pAge = p.age_group || "adult";
      if (pAge !== ageTab) return false;
      if (ageTab === "adult" && segment !== "all" && p.status !== segment) return false;
      return true;
    });

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.phone || "").includes(q) ||
        (p.member_id || "").toLowerCase().includes(q)
      );
    }

    list.sort((a: any, b: any) => {
      switch (sortBy) {
        case "name-az": return a.first_name.localeCompare(b.first_name);
        case "name-za": return b.first_name.localeCompare(a.first_name);
        case "newest": return (b.joined_at || "").localeCompare(a.joined_at || "");
        case "oldest": return (a.joined_at || "").localeCompare(b.joined_at || "");
        default: return 0;
      }
    });

    return list;
  }, [people, ageTab, segment, search, sortBy]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this member? This action cannot be undone.")) return;
    await db.delete("person", id);
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
    showToast("Member deleted");
  }

  const addLabel = ageTab === "child" ? "Add child" : ageTab === "teen" ? "Add teen" : "Add member";

  return (
    <PageShell title="People">
      <PageHeader title="People" description="Your whole congregation — members, families, teens and children.">
        <button onClick={() => { setEditingId(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> {addLabel}
        </button>
      </PageHeader>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} icon={Users} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Adults" value={stats.adults} icon={User} color="bg-success/10 text-success" />
        <StatCard label="Teens" value={stats.teens} icon={GraduationCap} color="bg-gold/10 text-gold" />
        <StatCard label="Children" value={stats.children} icon={Baby} color="bg-info/10 text-info" />
        <StatCard label="Departments" value={stats.departments} icon={Grid3X3} color="bg-primary-soft text-primary-bright" />
      </div>

      {/* Age group tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-line bg-surface-2/50 p-1">
        {ageGroupTabs.map((tab) => {
          const count = tab.key === "adult" ? stats.adults : tab.key === "teen" ? stats.teens : stats.children;
          return (
            <button
              key={tab.key}
              onClick={() => { setAgeTab(tab.key); setSegment("all"); setSearch(""); }}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                ageTab === tab.key ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
              <span className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                ageTab === tab.key ? "badge-primary" : "bg-surface-3 text-ink-faint"
              )}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {ageTab === "adult" && segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                segment === s.key ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2"
              )}
            >{s.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {ageTab === "adult" && departments.length > 0 && (
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink">
              <option value="">All departments</option>
              {departments.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink">
            <option value="name-az">A → Z</option>
            <option value="name-za">Z → A</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button onClick={() => setView("list")} className={cn("grid size-9 place-items-center", view === "list" ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-3")}>
              <List className="size-4" />
            </button>
            <button onClick={() => setView("grid")} className={cn("grid size-9 place-items-center", view === "grid" ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-3")}>
              <Grid3X3 className="size-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              className="input h-9 pl-9 w-56" placeholder="Search members..." />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 text-primary-bright whq-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="mx-auto size-12 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No members match your search" : "No members yet"}</p>
          <p className="mt-1 text-xs text-ink-muted">Sync to pull data from the cloud, or add members manually.</p>
          {!search && (
            <button onClick={() => { setEditingId(null); setShowForm(true); }} className="btn-primary btn-sm mt-4">
              <Plus className="size-3.5" /> {addLabel}
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <div key={p.id} onClick={() => setSelected(p)}
              className="card-hover cursor-pointer group">
              <div className="flex items-center gap-3">
                <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{p.first_name} {p.last_name}</p>
                  {p.leader_title && <p className="truncate text-[10px] font-medium text-gold">{p.leader_title}</p>}
                  <p className="truncate text-[11px] text-ink-faint">{p.member_id || p.phone || p.email || "No contact"}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className={cn("badge", p.status === "active" ? "badge-success" : p.status === "visitor" ? "badge-info" : "badge-muted")}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Contact</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Joined</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((p) => (
                <tr key={p.id} onClick={() => setSelected(p)}
                  className="cursor-pointer transition-colors hover:bg-surface-2/50 group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{p.first_name} {p.last_name}</p>
                        {p.member_id && <p className="text-[10px] text-ink-faint font-mono">{p.member_id}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-ink-muted">{p.phone || "—"}</p>
                    {p.email && <p className="text-[11px] text-ink-faint">{p.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("badge", p.status === "active" ? "badge-success" : p.status === "visitor" ? "badge-info" : "badge-muted")}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{p.joined_at ? formatDate(p.joined_at) : "—"}</td>
                  <td className="px-4 py-3">
                    <ChevronRight className="size-4 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      <PersonDrawer
        person={selected}
        onClose={() => setSelected(null)}
        onEdit={(id) => { setEditingId(id); setShowForm(true); setSelected(null); }}
        onDelete={handleDelete}
      />

      {/* Add/Edit modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }}
        title={editingId ? "Edit Member" : "Add Member"} wide>
        <PersonForm
          churchId={session!.churchId}
          editId={editingId}
          ageGroup={ageTab}
          departments={departments}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSaved={() => { setShowForm(false); setEditingId(null); loadPeople(); }}
        />
      </Modal>
    </PageShell>
  );
}

function PersonDrawer({
  person: p,
  onClose,
  onEdit,
  onDelete,
}: {
  person: any | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!p) return null;

  const fullName = `${p.first_name} ${p.last_name}`;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-8">
          <button onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg bg-surface/80 hover:bg-surface">
            <X className="size-4 text-ink-faint" />
          </button>
          <div className="flex items-center gap-4">
            <Avatar name={fullName} src={p.photo_url} size="xl" />
            <div>
              <h2 className="text-xl font-bold text-ink">{fullName}</h2>
              {p.leader_title && <p className="text-sm font-medium text-gold">{p.leader_title}</p>}
              {p.member_id && <p className="mt-0.5 text-xs text-ink-faint font-mono">{p.member_id}</p>}
              <div className="mt-2 flex gap-1.5">
                <span className={cn("badge", p.status === "active" ? "badge-success" : p.status === "visitor" ? "badge-info" : "badge-muted")}>
                  {p.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          <DetailSection title="Contact">
            <DetailRow icon={Phone} label="Phone" value={p.phone} />
            <DetailRow icon={Mail} label="Email" value={p.email} />
            <DetailRow icon={MapPin} label="Location" value={p.location || p.town} />
          </DetailSection>

          <DetailSection title="Personal">
            <DetailRow icon={User} label="Gender" value={p.gender} />
            <DetailRow icon={Heart} label="Marital Status" value={p.marital_status} />
            <DetailRow icon={Briefcase} label="Occupation" value={p.occupation} />
            {p.date_of_birth && <DetailRow icon={User} label="Birthday" value={formatDate(p.date_of_birth)} />}
          </DetailSection>

          {p.notes && (
            <DetailSection title="Notes">
              <p className="text-sm text-ink-muted">{p.notes}</p>
            </DetailSection>
          )}

          {/* Key dates */}
          <div className="rounded-xl border border-line bg-surface-2/50 p-4">
            <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-2">Key Dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-ink-faint">Birthday</p>
                <p className="text-sm font-medium text-ink">{p.birthday || p.date_of_birth ? formatDate(p.date_of_birth || p.birthday) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-ink-faint">Joined</p>
                <p className="text-sm font-medium text-ink">{p.joined_at ? formatDate(p.joined_at) : "—"}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={() => onEdit(p.id)} className="btn-primary flex-1 btn-sm">
              <Edit3 className="size-3.5" /> Edit Profile
            </button>
            <button onClick={() => onDelete(p.id)} className="btn-danger btn-sm px-3">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 text-ink-faint shrink-0" />
      <div>
        <p className="text-[10px] text-ink-faint">{label}</p>
        <p className="text-sm text-ink">{value}</p>
      </div>
    </div>
  );
}

function PersonForm({
  churchId,
  editId,
  ageGroup,
  departments,
  onClose,
  onSaved,
}: {
  churchId: string;
  editId: string | null;
  ageGroup: AgeTab;
  departments: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    gender: "", status: "active", location: "", occupation: "",
    marital_status: "", date_of_birth: "", notes: "", age_group: ageGroup,
    school: "", grade: "", guardian_name: "", guardian_phone: "",
    nationality: "", emergency_name: "", emergency_phone: "", emergency_relation: "",
  });

  useEffect(() => {
    if (editId) {
      db.getById("person", editId).then((p) => {
        if (p) setForm({
          first_name: p.first_name || "", last_name: p.last_name || "",
          email: p.email || "", phone: p.phone || "", gender: p.gender || "",
          status: p.status || "active", location: p.location || p.town || "",
          occupation: p.occupation || "", marital_status: p.marital_status || "",
          date_of_birth: p.date_of_birth || "", notes: p.notes || "",
          age_group: p.age_group || "adult",
          school: p.school || "", grade: p.grade || "",
          guardian_name: p.guardian_name || "", guardian_phone: p.guardian_phone || "",
          nationality: p.nationality || "",
          emergency_name: p.emergency_name || "", emergency_phone: p.emergency_phone || "",
          emergency_relation: p.emergency_relation || "",
        });
      });
    }
  }, [editId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name || !form.last_name) return;
    setSaving(true);

    if (editId) {
      await db.update("person", editId, form);
      showToast("Member updated");
    } else {
      await db.insert("person", { id: uuid(), church_id: churchId, ...form, joined_at: new Date().toISOString() });
      showToast("Member added");
    }

    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const isYouth = form.age_group === "teen" || form.age_group === "child";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">First Name *</label>
          <input value={form.first_name} onChange={set("first_name")} className="input" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Last Name *</label>
          <input value={form.last_name} onChange={set("last_name")} className="input" required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
          <input type="email" value={form.email} onChange={set("email")} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Phone</label>
          <input value={form.phone} onChange={set("phone")} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Gender</label>
          <select value={form.gender} onChange={set("gender")} className="input">
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
          <select value={form.status} onChange={set("status")} className="input">
            <option value="active">Active</option>
            <option value="visitor">Visitor</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Age Group</label>
          <select value={form.age_group} onChange={set("age_group")} className="input">
            <option value="adult">Adult</option>
            <option value="teen">Teen</option>
            <option value="child">Child</option>
          </select>
        </div>
      </div>

      {!isYouth && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Marital Status</label>
            <select value={form.marital_status} onChange={set("marital_status")} className="input">
              <option value="">—</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Occupation</label>
            <input value={form.occupation} onChange={set("occupation")} className="input" />
          </div>
        </div>
      )}

      {isYouth && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">School</label>
            <input value={form.school} onChange={set("school")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Grade/Class</label>
            <input value={form.grade} onChange={set("grade")} className="input" />
          </div>
        </div>
      )}

      {isYouth && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Guardian Name</label>
            <input value={form.guardian_name} onChange={set("guardian_name")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Guardian Phone</label>
            <input value={form.guardian_phone} onChange={set("guardian_phone")} className="input" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Location</label>
          <input value={form.location} onChange={set("location")} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Date of Birth</label>
          <input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Nationality</label>
          <input value={form.nationality} onChange={set("nationality")} className="input" placeholder="e.g. Ghanaian" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Emergency Contact</label>
          <input value={form.emergency_name} onChange={set("emergency_name")} className="input" placeholder="Name" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
        <textarea value={form.notes} onChange={set("notes")} className="input min-h-[60px] resize-none" />
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : editId ? "Update Member" : "Add Member"}
        </button>
      </div>
    </form>
  );
}
