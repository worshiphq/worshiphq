import { useEffect, useState, useMemo } from "react";
import { Loader2, Shield, Search, Plus, Pencil, Trash2, Eye, LogIn, Download } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDateTime } from "../lib/utils";

const ACTION_META: Record<string, { icon: any; color: string; label: string }> = {
  create: { icon: Plus, color: "text-success", label: "Created" },
  update: { icon: Pencil, color: "text-info", label: "Updated" },
  delete: { icon: Trash2, color: "text-danger", label: "Deleted" },
  login: { icon: LogIn, color: "text-gold", label: "Logged in" },
  export: { icon: Download, color: "text-purple-500", label: "Exported" },
  view: { icon: Eye, color: "text-ink-muted", label: "Viewed" },
};

export function AuditLogPage() {
  const { session, syncVersion } = useAppStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM audit_log WHERE church_id = ? ORDER BY created_at DESC LIMIT 500",
      [session!.churchId]
    );
    setLogs(rows);
    setLoading(false);
  }

  const entities = useMemo(() => [...new Set(logs.map((l) => l.entity))].sort(), [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (entityFilter && l.entity !== entityFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        l.action?.toLowerCase().includes(q) ||
        l.entity?.toLowerCase().includes(q) ||
        l.detail?.toLowerCase().includes(q) ||
        l.user_name?.toLowerCase().includes(q)
      );
    });
  }, [logs, search, entityFilter]);

  return (
    <PageShell title="Audit Log">
      <PageHeader title="Audit Log" description="A record of all actions performed in your church account." />

      <div className="mb-5">
        <StatCard label="Total Entries" value={logs.length} icon={Shield} color="text-primary-bright" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search logs..." />
        </div>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="input h-9 w-auto">
          <option value="">All entities</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Shield className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">
            {search || entityFilter ? "No logs match your filter." : "No audit logs yet. Actions will appear here as your team uses the app."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((l) => {
            const meta = ACTION_META[l.action?.toLowerCase()] ?? ACTION_META.view;
            const Icon = meta.icon;
            return (
              <div key={l.id} className="card !px-4 !py-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${meta.color}`}><Icon className="size-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{l.user_name || l.user_id || "System"}</span>
                      <span className="badge badge-muted text-[10px]">{meta.label} {l.entity}</span>
                    </div>
                    {l.detail && <p className="mt-0.5 text-xs text-ink-muted">{l.detail}</p>}
                    <p className="mt-1 text-[11px] text-ink-faint">{formatDateTime(l.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
