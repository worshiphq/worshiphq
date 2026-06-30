import { useEffect, useState, useMemo } from "react";
import { Loader2, Users, Search, Phone, Mail } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

export function DirectoryPage() {
  const { session, syncVersion } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [letterFilter, setLetterFilter] = useState<string>("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM person WHERE church_id = ? ORDER BY first_name ASC", [session!.churchId]);
    setPeople(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = people;
    if (letterFilter) list = list.filter((p) => p.first_name?.toUpperCase().startsWith(letterFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.first_name?.toLowerCase().includes(q) || p.last_name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.email?.toLowerCase().includes(q));
    }
    return list;
  }, [people, search, letterFilter]);

  const letters = useMemo(() => {
    const s = new Set(people.map((p) => p.first_name?.[0]?.toUpperCase()).filter(Boolean));
    return Array.from(s).sort();
  }, [people]);

  return (
    <PageShell title="Directory">
      <PageHeader title="Member Directory" description="Browse and search all church members." />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Total Members" value={people.length} icon={Users} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Active" value={people.filter((p) => p.status === "active").length} icon={Users} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search directory..." />
        </div>
      </div>

      {letters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          <button onClick={() => setLetterFilter("")}
            className={cn("rounded-md px-2 py-1 text-xs font-medium transition-colors",
              !letterFilter ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3"
            )}>All</button>
          {letters.map((l) => (
            <button key={l} onClick={() => setLetterFilter(l === letterFilter ? "" : l)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium transition-colors",
                letterFilter === l ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3"
              )}>{l}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Users className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search || letterFilter ? "No members match" : "No members yet"}</p>
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-2">
          {filtered.map((p) => (
            <div key={p.id} className="card p-3 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary-bright font-bold text-sm shrink-0">
                {(p.first_name?.[0] || "").toUpperCase()}{(p.last_name?.[0] || "").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-ink">{p.first_name} {p.last_name}</h3>
                <div className="flex items-center gap-3 mt-0.5">
                  {p.phone && <span className="flex items-center gap-1 text-[11px] text-ink-muted"><Phone className="size-3" />{p.phone}</span>}
                  {p.email && <span className="flex items-center gap-1 text-[11px] text-ink-muted"><Mail className="size-3" />{p.email}</span>}
                </div>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0",
                p.status === "active" ? "bg-success/10 text-success" : "bg-surface-3 text-ink-faint"
              )}>{p.status || "active"}</span>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
