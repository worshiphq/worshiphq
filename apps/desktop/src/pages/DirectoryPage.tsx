import { useEffect, useState, useMemo } from "react";
import { Loader2, Users, Search, Phone, Mail, Briefcase, LayoutGrid, List } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

function fullName(p: any) {
  return `${p.title ? p.title + " " : ""}${p.first_name} ${p.last_name}`;
}

export function DirectoryPage() {
  const { session, syncVersion } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [deptMap, setDeptMap] = useState<Record<string, string[]>>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [letterFilter, setLetterFilter] = useState<string>("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [ppl, depts, pd] = await Promise.all([
      db.rawQuery("SELECT * FROM person WHERE church_id = ? AND status = 'active' ORDER BY first_name ASC, last_name ASC", [cid]),
      db.rawQuery("SELECT * FROM department WHERE church_id = ? ORDER BY name ASC", [cid]),
      db.rawQuery(
        "SELECT pd.person_id, d.name FROM person_department pd JOIN department d ON pd.department_id = d.id WHERE d.church_id = ?",
        [cid]
      ),
    ]);
    setPeople(ppl);
    setDepartments(depts);
    const map: Record<string, string[]> = {};
    for (const row of pd) {
      (map[row.person_id] ||= []).push(row.name);
    }
    setDeptMap(map);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = people;
    if (deptFilter !== "all") list = list.filter((p) => (deptMap[p.id] || []).includes(deptFilter));
    if (letterFilter) list = list.filter((p) => p.first_name?.toUpperCase().startsWith(letterFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        fullName(p).toLowerCase().includes(q) || p.phone?.includes(q) ||
        p.email?.toLowerCase().includes(q) || p.occupation?.toLowerCase().includes(q) ||
        p.member_id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [people, search, deptFilter, letterFilter, deptMap]);

  const letters = useMemo(() => {
    const s = new Set(people.map((p) => p.first_name?.[0]?.toUpperCase()).filter(Boolean));
    return Array.from(s).sort();
  }, [people]);

  return (
    <PageShell title="Directory">
      <PageHeader title="Member directory" description={`${people.length} active member${people.length !== 1 ? "s" : ""}`} />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Active Members" value={people.length} icon={Users} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Departments" value={departments.length} icon={Users} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search by name, phone, email..." />
        </div>
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input h-9 w-44 text-sm">
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        )}
        <div className="flex rounded-lg border border-line overflow-hidden">
          <button onClick={() => setLayout("grid")} className={cn("grid size-9 place-items-center", layout === "grid" ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-2")}><LayoutGrid className="size-4" /></button>
          <button onClick={() => setLayout("list")} className={cn("grid size-9 place-items-center", layout === "list" ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-2")}><List className="size-4" /></button>
        </div>
      </div>

      {letters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          <button onClick={() => setLetterFilter("")} className={cn("rounded-md px-2 py-1 text-xs font-medium transition-colors", !letterFilter ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>All</button>
          {letters.map((l) => (
            <button key={l} onClick={() => setLetterFilter(l === letterFilter ? "" : l)} className={cn("rounded-md px-2 py-1 text-xs font-medium transition-colors", letterFilter === l ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>{l}</button>
          ))}
        </div>
      )}

      <p className="mb-3 text-xs text-ink-faint">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || deptFilter !== "all" || letterFilter ? "No members match your search" : "No members yet"}</p>
        </div>
      ) : layout === "grid" ? (
        <div className="grid gap-3 grid-cols-4">
          {filtered.map((p) => {
            const depts = deptMap[p.id] || [];
            return (
              <div key={p.id} className="card p-4 text-center">
                <div className="mx-auto w-fit"><Avatar name={fullName(p)} src={p.photo_url} size="lg" /></div>
                <h3 className="mt-3 text-sm font-semibold text-ink">{fullName(p)}</h3>
                {p.member_id && <p className="text-[10px] text-ink-faint font-mono">{p.member_id}</p>}
                {p.occupation && <p className="mt-1 flex items-center justify-center gap-1 text-xs text-ink-muted"><Briefcase className="size-3" /> {p.occupation}</p>}
                {depts.length > 0 && (
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {depts.map((d) => <span key={d} className="badge badge-muted text-[10px]">{d}</span>)}
                  </div>
                )}
                {p.phone && <a href={`tel:${p.phone}`} className="mt-2 inline-flex items-center justify-center gap-1 text-xs text-ink-muted hover:text-primary-bright"><Phone className="size-3" /> {p.phone}</a>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((p) => {
            const depts = deptMap[p.id] || [];
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
                <Avatar name={fullName(p)} src={p.photo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{fullName(p)}</p>
                  <div className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    {p.member_id && <span className="font-mono">{p.member_id}</span>}
                    {p.occupation && <span className="flex items-center gap-1"><Briefcase className="size-3" /> {p.occupation}</span>}
                    {depts.length > 0 && <span>{depts.join(", ")}</span>}
                  </div>
                </div>
                <div className="hidden shrink-0 gap-3 text-xs text-ink-muted sm:flex">
                  {p.phone && <a href={`tel:${p.phone}`} className="flex items-center gap-1 hover:text-primary-bright"><Phone className="size-3" /> {p.phone}</a>}
                  {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1 hover:text-primary-bright"><Mail className="size-3" /> {p.email}</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
