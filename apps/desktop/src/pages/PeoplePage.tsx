import { useEffect, useState, useMemo } from "react";
import {
  Search, Plus, Loader2, Trash2, Edit3, X, Users, User,
  Grid3X3, List, Phone, Mail, MapPin, Briefcase, Heart,
  ChevronRight, ArrowDownAZ, GraduationCap, Baby, MessageSquare,
  Camera, ChevronDown, ChevronUp, Shield, Calendar, Home, Globe,
  BookOpen, Star, AlertCircle, Fingerprint,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal, Drawer } from "../components/ui/Modal";
import { Lightbox } from "../components/ui/Lightbox";
import { db } from "../lib/api";
import { requireOnline } from "../lib/net";
import { useAppStore } from "../stores/app-store";
import { cn, formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

type AgeTab = "adult" | "teen" | "child";
type Segment = "all" | "active" | "inactive";
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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
    let list = people;
    if (ageTab !== "adult") {
      list = list.filter((p) => p.age_group === ageTab);
    } else {
      list = list.filter((p) => !p.age_group || p.age_group === "adult");
    }
    if (segment !== "all") list = list.filter((p) => p.status === segment);
    if (deptFilter) {
      list = list.filter((p) => p.department_id === deptFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.phone || "").includes(q) ||
        (p.member_id || "").toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name-az": return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
        case "name-za": return `${b.first_name} ${b.last_name}`.localeCompare(`${a.first_name} ${a.last_name}`);
        case "newest": return (b.joined_at || "").localeCompare(a.joined_at || "");
        case "oldest": return (a.joined_at || "").localeCompare(b.joined_at || "");
        default: return 0;
      }
    });
    return list;
  }, [people, ageTab, segment, search, sortBy, deptFilter]);

  function openEdit(id: string) {
    setEditingId(id);
    setShowForm(true);
    setSelected(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this member? This cannot be undone.")) return;
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
    showToast("Member deleted");
    await db.delete("person", id);
  }

  async function handleSendSms(personId: string, phone: string) {
    const ok = await requireOnline("send SMS");
    if (!ok) return;
    showToast("Opening SMS on web...");
    window.api?.openExternal(`https://worshiphq.app/app/communications?to=${phone}`);
  }

  function handleAvatarClick(p: any, e: React.MouseEvent) {
    e.stopPropagation();
    if (p.photo_url) setLightboxSrc(p.photo_url);
  }

  return (
    <PageShell title="People">
      <PageHeader title="People" description="Manage your church members, visitors and contacts.">
        <button onClick={() => { setEditingId(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Member
        </button>
      </PageHeader>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total" value={stats.total} icon={Users} color="text-primary-bright" />
        <StatCard label="Adults" value={stats.adults} icon={Users} color="text-success" />
        <StatCard label="Teens" value={stats.teens} icon={GraduationCap} color="text-info" />
        <StatCard label="Children" value={stats.children} icon={Baby} color="text-gold" />
        <StatCard label="Departments" value={stats.departments} icon={Shield} color="text-sky" />
      </div>

      {/* Age group tabs */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex gap-1.5">
          {ageGroupTabs.map((t) => (
            <button key={t.key} onClick={() => setAgeTab(t.key)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                ageTab === t.key ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2"
              )}>
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-line" />
        <div className="flex gap-1">
          {segments.map((s) => (
            <button key={s.key} onClick={() => setSegment(s.key)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                segment === s.key ? "bg-surface-3 text-ink" : "text-ink-faint hover:bg-surface-2"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="input h-10 pl-9 w-56" placeholder="Search members..." />
          </div>
          {departments.length > 0 && (
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input h-9 w-40 text-sm">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="input h-9 w-36 text-sm">
            <option value="name-az">Name A-Z</option>
            <option value="name-za">Name Z-A</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
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

      {/* People list / grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-primary-bright whq-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Users className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || deptFilter ? "No members match your filter" : "No members yet"}</p>
          <p className="mt-1 text-xs text-ink-muted">Add a member or sync with the cloud to pull data.</p>
          <button onClick={() => { setEditingId(null); setShowForm(true); }} className="btn-primary btn-sm mt-4">
            <Plus className="size-3.5" /> Add Member
          </button>
        </div>
      ) : view === "list" ? (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Member</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Contact</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">ID</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((p) => {
                const name = `${p.first_name} ${p.last_name}`;
                return (
                  <tr key={p.id} onClick={() => setSelected(p)}
                    className="cursor-pointer transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div onClick={(e) => handleAvatarClick(p, e)} className={p.photo_url ? "cursor-zoom-in" : ""}>
                          <Avatar name={name} src={p.photo_url} size="sm" />
                        </div>
                        <div>
                          <p className="font-medium text-ink">{name}</p>
                          {p.leader_title && <p className="text-[10px] text-gold font-medium">{p.leader_title}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-ink-muted">{p.phone || p.email || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("badge", p.status === "active" ? "badge-success" : "badge-muted")}>
                        {p.status || "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-faint font-mono">{p.member_id || "—"}</td>
                    <td className="px-4 py-3">
                      <ChevronRight className="size-4 text-ink-faint" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p, i) => {
            const name = `${p.first_name} ${p.last_name}`;
            return (
              <div key={p.id} onClick={() => setSelected(p)}
                className="group cursor-pointer rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md"
                style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-col items-center text-center">
                  <div onClick={(e) => handleAvatarClick(p, e)} className={p.photo_url ? "cursor-zoom-in" : ""}>
                    <Avatar name={name} src={p.photo_url} size="lg" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-ink">{name}</h3>
                  {p.leader_title && <p className="mt-0.5 text-xs font-medium text-gold">{p.leader_title}</p>}
                  <p className="mt-0.5 text-xs text-ink-faint">{p.member_id || p.phone || p.email || "---"}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    <span className={cn("badge text-[10px]", p.status === "active" ? "badge-success" : "badge-muted")}>
                      {p.status || "active"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-ink-faint text-center">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>

      {/* Detail Drawer */}
      <PersonDrawer
        person={selected}
        departments={departments}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        onSendSms={handleSendSms}
        onPhotoClick={(src) => setLightboxSrc(src)}
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

      {/* Lightbox */}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} alt="Member photo" onClose={() => setLightboxSrc(null)} />
      )}
    </PageShell>
  );
}

/* ─── Person Drawer ─── */
function PersonDrawer({
  person: p, departments, onClose, onEdit, onDelete, onSendSms, onPhotoClick,
}: {
  person: any | null; departments: any[]; onClose: () => void;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
  onSendSms: (id: string, phone: string) => void;
  onPhotoClick: (src: string) => void;
}) {
  const [personDepts, setPersonDepts] = useState<string[]>([]);

  useEffect(() => {
    if (p?.id) {
      db.rawQuery("SELECT d.name FROM person_department pd JOIN department d ON pd.department_id = d.id WHERE pd.person_id = ?", [p.id])
        .then((rows: any[]) => setPersonDepts(rows.map((r) => r.name)))
        .catch(() => setPersonDepts([]));
    }
  }, [p?.id]);

  if (!p) return null;

  const fullName = `${p.first_name} ${p.last_name}`;
  const deptName = departments.find((d) => d.id === p.department_id)?.name;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="relative bg-gradient-to-br from-primary/8 via-surface to-surface px-6 pb-4 pt-6">
          <button onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2">
            <X className="size-5" />
          </button>
          <div className="flex items-center gap-4">
            <div onClick={() => p.photo_url && onPhotoClick(p.photo_url)}
              className={p.photo_url ? "cursor-zoom-in" : ""}>
              <Avatar name={fullName} src={p.photo_url} size="xl" className="ring-4 ring-surface" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink">{fullName}</h2>
              {p.title && <p className="text-sm text-ink-muted">{p.title}</p>}
              {p.leader_title && <p className="text-sm font-medium text-gold">{p.leader_title}</p>}
              {p.member_id && <p className="mt-0.5 text-xs text-ink-faint font-mono">{p.member_id}</p>}
              <div className="mt-2 flex gap-1.5">
                <span className={cn("badge", p.status === "active" ? "badge-success" : "badge-muted")}>
                  {p.status || "active"}
                </span>
                {p.featured && <span className="badge badge-primary">Featured</span>}
                {p.baptized && <span className="badge badge-info">Baptized</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          {/* Contact details */}
          <div className="mt-4 space-y-1">
            <DetailRow icon={Phone} label="Phone" value={p.phone} />
            <DetailRow icon={Mail} label="Email" value={p.email} />
            <DetailRow icon={MapPin} label="Location" value={p.town || p.location || p.house_address} />
            {p.occupation && <DetailRow icon={Briefcase} label="Occupation" value={p.occupation} />}
            {p.gender && <DetailRow icon={User} label="Gender" value={p.gender} />}
            {p.marital_status && <DetailRow icon={Heart} label="Marital Status" value={p.marital_status} />}
            {p.nationality && <DetailRow icon={Shield} label="Nationality" value={p.nationality} />}
            {p.date_of_birth && <DetailRow icon={Calendar} label="Date of Birth" value={formatDate(p.date_of_birth)} />}
          </div>

          {/* Youth / Guardian */}
          {(p.age_group === "teen" || p.age_group === "child") && (p.guardian_name || p.school) && (
            <Section title="Parent / Guardian">
              {p.guardian_name && (
                <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-sm">
                  <div className="font-medium">{p.guardian_name}</div>
                  {p.guardian_phone && <div className="mt-1 text-ink-muted">{p.guardian_phone}</div>}
                </div>
              )}
              {p.school && (
                <div className="mt-2 space-y-1">
                  <DetailRow icon={GraduationCap} label="School" value={p.school} />
                  {p.grade && <DetailRow icon={BookOpen} label="Grade" value={p.grade} />}
                </div>
              )}
            </Section>
          )}

          {/* Departments */}
          {(deptName || personDepts.length > 0) && (
            <Section title="Departments">
              <div className="flex flex-wrap gap-1.5">
                {(personDepts.length ? personDepts : [deptName]).filter(Boolean).map((d) => (
                  <span key={d} className="badge badge-primary">{d}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Key dates */}
          <Section title="Key dates">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-surface-2/40 p-3">
                <div className="text-xs text-ink-faint">Birthday</div>
                <div className="text-sm font-medium">{p.date_of_birth ? formatDate(p.date_of_birth) : "---"}</div>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/40 p-3">
                <div className="text-xs text-ink-faint">Joined</div>
                <div className="text-sm font-medium">{p.joined_at ? formatDate(p.joined_at) : "---"}</div>
              </div>
            </div>
          </Section>

          {/* Emergency contact */}
          {(p.emergency_name || p.emergency_phone) && (
            <Section title="Emergency contact">
              <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-sm">
                {p.emergency_name && <div className="font-medium">{p.emergency_name}</div>}
                {p.emergency_relation && <div className="text-xs text-ink-faint">{p.emergency_relation}</div>}
                {p.emergency_phone && <div className="mt-1 text-ink-muted">{p.emergency_phone}</div>}
                {p.emergency_email && <div className="text-ink-muted">{p.emergency_email}</div>}
              </div>
            </Section>
          )}

          {p.notes && (
            <Section title="Notes">
              <p className="text-sm text-ink-muted whitespace-pre-wrap">{p.notes}</p>
            </Section>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button onClick={() => onEdit(p.id)} className="btn-primary flex-1 btn-sm">
              <Edit3 className="size-3.5" /> Edit profile
            </button>
            {p.phone && (
              <button onClick={() => onSendSms(p.id, p.phone)} className="btn-secondary btn-sm px-3">
                <MessageSquare className="size-3.5" /> SMS
              </button>
            )}
            <button onClick={() => onDelete(p.id)} className="btn-danger btn-sm px-3">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm transition-colors hover:bg-surface-2/50">
      <span className="grid size-8 place-items-center rounded-lg bg-surface-2/60">
        <Icon className="size-3.5 text-ink-faint" />
      </span>
      <span className="text-ink-muted">{value}</span>
    </div>
  );
}

/* ─── Collapsible Section for Form ─── */
function FormSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 bg-surface-2/50 text-sm font-semibold text-ink hover:bg-surface-2 transition-colors">
        {title}
        {open ? <ChevronUp className="size-4 text-ink-faint" /> : <ChevronDown className="size-4 text-ink-faint" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

/* ─── Full Person Form ─── */
function PersonForm({
  churchId, editId, ageGroup, departments, onClose, onSaved,
}: {
  churchId: string; editId: string | null; ageGroup: AgeTab;
  departments: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", other_names: "", email: "", phone: "",
    work_phone: "", home_phone: "",
    gender: "", title: "", status: "active", age_group: ageGroup as string,
    date_of_birth: "", marital_status: "", occupation: "", employer: "",
    nationality: "", country: "", region: "", district: "", town: "",
    home_town: "", place_of_birth: "", house_address: "", postal_address: "",
    department_id: "", date_of_membership: "", previous_church: "",
    baptized: "", special_interest: "", leader_title: "", featured: false,
    school: "", grade: "", guardian_name: "", guardian_phone: "", parent_id: "",
    emergency_name: "", emergency_phone: "", emergency_relation: "",
    emergency_email: "", emergency_address: "",
    notes: "", photo_url: "",
    location: "",
  });

  useEffect(() => {
    if (editId) {
      db.getById("person", editId).then((p) => {
        if (p) {
          setForm({
            first_name: p.first_name || "", last_name: p.last_name || "",
            other_names: p.other_names || "", email: p.email || "",
            phone: p.phone || "", work_phone: p.work_phone || "",
            home_phone: p.home_phone || "", gender: p.gender || "",
            title: p.title || "", status: p.status || "active",
            age_group: p.age_group || "adult",
            date_of_birth: p.date_of_birth || "", marital_status: p.marital_status || "",
            occupation: p.occupation || "", employer: p.employer || "",
            nationality: p.nationality || "", country: p.country || "",
            region: p.region || "", district: p.district || "",
            town: p.town || "", home_town: p.home_town || "",
            place_of_birth: p.place_of_birth || "",
            house_address: p.house_address || "", postal_address: p.postal_address || "",
            department_id: p.department_id || "",
            date_of_membership: p.date_of_membership || "",
            previous_church: p.previous_church || "",
            baptized: p.baptized ? "yes" : "",
            special_interest: p.special_interest || "",
            leader_title: p.leader_title || "",
            featured: !!p.featured,
            school: p.school || "", grade: p.grade || "",
            guardian_name: p.guardian_name || "", guardian_phone: p.guardian_phone || "",
            parent_id: p.parent_id || "",
            emergency_name: p.emergency_name || "", emergency_phone: p.emergency_phone || "",
            emergency_relation: p.emergency_relation || "",
            emergency_email: p.emergency_email || "",
            emergency_address: p.emergency_address || "",
            notes: p.notes || "", photo_url: p.photo_url || "",
            location: p.location || "",
          });
          setPhotoPreview(p.photo_url || null);
        }
      });
    }
  }, [editId]);

  async function handlePickPhoto() {
    setPickingPhoto(true);
    try {
      const result = await window.api?.pickImage();
      if (!result) { setPickingPhoto(false); return; }
      if (typeof result === "object" && "error" in result) {
        showToast(result.error, "error");
        setPickingPhoto(false);
        return;
      }
      const dataUrl = result as string;
      setPhotoPreview(dataUrl);
      setForm((f) => ({ ...f, photo_url: dataUrl }));
    } catch {
      showToast("Failed to pick photo", "error");
    }
    setPickingPhoto(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name || !form.last_name) return;
    setSaving(true);

    const data: any = { ...form };
    data.baptized = data.baptized === "yes" ? 1 : 0;
    data.featured = data.featured ? 1 : 0;
    if (!data.department_id) data.department_id = null;
    if (!data.parent_id) data.parent_id = null;
    if (!data.photo_url) data.photo_url = null;

    try {
      if (editId) {
        await db.update("person", editId, data);
        showToast("Member updated");
      } else {
        await db.insert("person", {
          id: uuid(), church_id: churchId, ...data,
          joined_at: new Date().toISOString(),
        });
        showToast("Member added");
      }
      onSaved();
    } catch (err) {
      showToast("Failed to save", "error");
    }
    setSaving(false);
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const isYouth = form.age_group === "teen" || form.age_group === "child";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Photo */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          {photoPreview ? (
            <img src={photoPreview} alt="" className="size-16 rounded-full object-cover border border-line" />
          ) : (
            <div className="grid size-16 place-items-center rounded-full bg-surface-3 border border-line">
              <Camera className="size-6 text-ink-faint" />
            </div>
          )}
        </div>
        <div>
          <button type="button" onClick={handlePickPhoto} disabled={pickingPhoto} className="btn-secondary btn-sm">
            {pickingPhoto ? <Loader2 className="size-3.5 whq-spin" /> : <Camera className="size-3.5" />}
            {pickingPhoto ? "Choosing..." : photoPreview ? "Change Photo" : "Add Photo"}
          </button>
          {photoPreview && (
            <button type="button" onClick={() => { setPhotoPreview(null); setForm((f) => ({ ...f, photo_url: "" })); }}
              className="btn-ghost btn-sm text-danger ml-2">
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      {/* Basic Info — always open */}
      <FormSection title="Basic Information" defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">First Name *</label>
            <input value={form.first_name} onChange={set("first_name")} className="input" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Last Name *</label>
            <input value={form.last_name} onChange={set("last_name")} className="input" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Other Names</label>
            <input value={form.other_names} onChange={set("other_names")} className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Title</label>
            <input value={form.title} onChange={set("title")} className="input" placeholder="Mr, Mrs, Dr..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Gender</label>
            <select value={form.gender} onChange={set("gender")} className="input">
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
            <select value={form.status} onChange={set("status")} className="input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Date of Birth</label>
            <input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} className="input" />
          </div>
        </div>
      </FormSection>

      {/* Contact */}
      <FormSection title="Contact" defaultOpen>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Phone</label>
            <input value={form.phone} onChange={set("phone")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
            <input type="email" value={form.email} onChange={set("email")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Work Phone</label>
            <input value={form.work_phone} onChange={set("work_phone")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Home Phone</label>
            <input value={form.home_phone} onChange={set("home_phone")} className="input" />
          </div>
        </div>
      </FormSection>

      {/* Personal */}
      <FormSection title="Personal Details">
        <div className="grid grid-cols-2 gap-3">
          {!isYouth && (
            <>
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
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Employer</label>
                <input value={form.employer} onChange={set("employer")} className="input" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Nationality</label>
            <input value={form.nationality} onChange={set("nationality")} className="input" placeholder="e.g. Ghanaian" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Country</label>
            <input value={form.country} onChange={set("country")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Region</label>
            <input value={form.region} onChange={set("region")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">District</label>
            <input value={form.district} onChange={set("district")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Town</label>
            <input value={form.town} onChange={set("town")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Home Town</label>
            <input value={form.home_town} onChange={set("home_town")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Place of Birth</label>
            <input value={form.place_of_birth} onChange={set("place_of_birth")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">House Address</label>
            <input value={form.house_address} onChange={set("house_address")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Postal Address</label>
            <input value={form.postal_address} onChange={set("postal_address")} className="input" />
          </div>
        </div>
      </FormSection>

      {/* Church */}
      <FormSection title="Church Details">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Department</label>
            <select value={form.department_id} onChange={set("department_id")} className="input">
              <option value="">— None —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Date of Membership</label>
            <input type="date" value={form.date_of_membership} onChange={set("date_of_membership")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Previous Church</label>
            <input value={form.previous_church} onChange={set("previous_church")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Baptized</label>
            <select value={form.baptized} onChange={set("baptized")} className="input">
              <option value="">— Unknown —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Leader Title</label>
            <input value={form.leader_title} onChange={set("leader_title")} className="input" placeholder="e.g. Deacon, Elder" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Special Interest</label>
            <input value={form.special_interest} onChange={set("special_interest")} className="input" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
          <input type="checkbox" checked={form.featured}
            onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
            className="rounded border-line accent-primary" />
          Featured member (shown on public page)
        </label>
      </FormSection>

      {/* Youth / Guardian */}
      {isYouth && (
        <FormSection title="Youth / Guardian" defaultOpen>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">School</label>
              <input value={form.school} onChange={set("school")} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Grade / Class</label>
              <input value={form.grade} onChange={set("grade")} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Guardian Name</label>
              <input value={form.guardian_name} onChange={set("guardian_name")} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Guardian Phone</label>
              <input value={form.guardian_phone} onChange={set("guardian_phone")} className="input" />
            </div>
          </div>
        </FormSection>
      )}

      {/* Emergency */}
      <FormSection title="Emergency Contact">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Name</label>
            <input value={form.emergency_name} onChange={set("emergency_name")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Phone</label>
            <input value={form.emergency_phone} onChange={set("emergency_phone")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Relation</label>
            <input value={form.emergency_relation} onChange={set("emergency_relation")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
            <input type="email" value={form.emergency_email} onChange={set("emergency_email")} className="input" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-muted mb-1">Address</label>
            <input value={form.emergency_address} onChange={set("emergency_address")} className="input" />
          </div>
        </div>
      </FormSection>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
        <textarea value={form.notes} onChange={set("notes")} className="input min-h-[60px] resize-none" />
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-surface pb-1">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : editId ? "Update Member" : "Add Member"}
        </button>
      </div>
    </form>
  );
}
