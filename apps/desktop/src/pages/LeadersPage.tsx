import { useEffect, useState, useMemo } from "react";
import { Loader2, Crown, Search, GripVertical } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

export function LeadersPage() {
  const { session, syncVersion } = useAppStore();
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM person WHERE church_id = ? AND (leader_title IS NOT NULL AND leader_title != '') ORDER BY leader_sort_order ASC, first_name ASC",
      [session!.churchId]
    );
    setLeaders(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return leaders;
    const q = search.toLowerCase();
    return leaders.filter((l) =>
      l.first_name?.toLowerCase().includes(q) || l.last_name?.toLowerCase().includes(q) ||
      l.leader_title?.toLowerCase().includes(q)
    );
  }, [leaders, search]);

  return (
    <PageShell title="Leaders">
      <PageHeader title="Church Leaders" description="Pastors, elders, deacons, and ministry heads." />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Total Leaders" value={leaders.length} icon={Crown} color="bg-gold/10 text-gold" />
        <StatCard label="Active" value={leaders.filter((l) => l.status === "active").length} icon={Crown} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search leaders..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Crown className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No leaders match" : "No leaders assigned yet"}</p>
          <p className="mt-1 text-xs text-ink-muted">Assign leader titles in People to see them here.</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-3">
          {filtered.map((l) => (
            <div key={l.id} className="card p-4">
              <div className="flex items-center gap-3">
                <Avatar name={`${l.first_name} ${l.last_name}`} src={l.photo_url} size="md" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-ink">{l.first_name} {l.last_name}</h3>
                  <p className="text-xs text-gold font-medium">{l.leader_title}</p>
                  {l.phone && <p className="text-[11px] text-ink-faint mt-0.5">{l.phone}</p>}
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                  l.status === "active" ? "bg-success/10 text-success" : "bg-surface-3 text-ink-faint"
                )}>{l.status || "active"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
