import { useEffect, useState, useMemo } from "react";
import { Loader2, Shield, Search } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-success/10 text-success",
  update: "bg-info/10 text-info",
  delete: "bg-danger/10 text-danger",
  login: "bg-gold/10 text-gold",
  export: "bg-purple-500/10 text-purple-500",
};

export function AuditLogPage() {
  const { session, syncVersion } = useAppStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM audit_log WHERE church_id = ? ORDER BY created_at DESC LIMIT 500", [session!.churchId]);
    setLogs(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) => l.action?.toLowerCase().includes(q) || l.entity?.toLowerCase().includes(q) || l.detail?.toLowerCase().includes(q));
  }, [logs, search]);

  return (
    <PageShell title="Audit Log">
      <PageHeader title="Audit Log" description="Activity history and change tracking." />

      <div className="mb-5">
        <StatCard label="Total Entries" value={logs.length} icon={Shield} color="bg-primary-soft text-primary-bright" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search audit log..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Shield className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No entries match" : "No audit log entries"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Action</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Entity</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Detail</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">User</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                      ACTION_COLORS[l.action?.toLowerCase()] || "bg-surface-3 text-ink-faint"
                    )}>{l.action}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{l.entity}</td>
                  <td className="px-4 py-3 text-ink-muted max-w-[250px] truncate">{l.detail || "—"}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{l.user_name || l.user_id || "System"}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
