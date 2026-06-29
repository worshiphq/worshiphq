import { useEffect, useState } from "react";
import { Search, Plus, ExternalLink } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate } from "../lib/utils";

interface Column {
  key: string;
  label: string;
  format?: "date" | "currency" | "status";
  className?: string;
}

interface DataListPageProps {
  title: string;
  table: string;
  columns: Column[];
  searchFields?: string[];
  orderBy?: string;
  emptyMessage?: string;
  webPath?: string;
}

export function DataListPage({
  title,
  table,
  columns,
  searchFields = [],
  orderBy = "created_at DESC",
  emptyMessage,
  webPath,
}: DataListPageProps) {
  const { session } = useAppStore();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [session?.churchId]);

  async function loadData() {
    if (!session?.churchId) return;
    setLoading(true);
    const data = await db.rawQuery(
      `SELECT * FROM "${table}" WHERE church_id = ? ORDER BY ${orderBy}`,
      [session.churchId]
    );
    setRows(data);
    setLoading(false);
  }

  const filtered = search
    ? rows.filter((r) =>
        searchFields.some((f) =>
          String(r[f] || "").toLowerCase().includes(search.toLowerCase())
        )
      )
    : rows;

  function renderCell(row: any, col: Column) {
    const val = row[col.key];
    if (val == null || val === "") return <span className="text-ink-faint">—</span>;
    if (col.format === "date") return formatDate(val);
    if (col.format === "currency") return formatCurrency(Number(val));
    if (col.format === "status") {
      const colors: Record<string, string> = {
        active: "bg-success/10 text-success",
        inactive: "bg-surface-3 text-ink-faint",
        visitor: "bg-gold/10 text-gold",
        pending: "bg-gold/10 text-gold",
        completed: "bg-success/10 text-success",
        cancelled: "bg-danger/10 text-danger",
      };
      return (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[val] || "bg-surface-3 text-ink-muted"}`}>
          {val}
        </span>
      );
    }
    return String(val);
  }

  return (
    <PageShell title={title}>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
            className="input pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{filtered.length} records</span>
        {webPath && (
          <button
            onClick={() => window.api?.openExternal(`https://worshiphq.app/app/${webPath}`)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-3"
          >
            <ExternalLink className="size-3" />
            Open on web
          </button>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="py-12 text-center text-sm text-ink-faint">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-ink-muted">
              {search ? "No results found." : emptyMessage || `No ${title.toLowerCase()} yet. Sync to pull data from the cloud.`}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-3/50">
                {columns.map((col) => (
                  <th key={col.key} className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint ${col.className || ""}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row, i) => (
                <tr key={row.id || i} className="transition-colors hover:bg-surface-3/30">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-2.5 text-ink ${col.className || ""}`}>
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
