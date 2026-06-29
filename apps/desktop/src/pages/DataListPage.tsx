import { useEffect, useState, useMemo } from "react";
import { Search, Plus, ExternalLink, Loader2, Trash2, Edit3, ChevronRight } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

interface Column {
  key: string;
  label: string;
  format?: "date" | "currency" | "status";
  className?: string;
  editable?: boolean;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
}

interface DataListPageProps {
  title: string;
  table: string;
  columns: Column[];
  searchFields?: string[];
  orderBy?: string;
  emptyMessage?: string;
  webPath?: string;
  canAdd?: boolean;
  canDelete?: boolean;
}

export function DataListPage({
  title,
  table,
  columns,
  searchFields = [],
  orderBy = "created_at DESC",
  emptyMessage,
  webPath,
  canAdd = true,
  canDelete = true,
}: DataListPageProps) {
  const { session, showToast } = useAppStore();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);

  useEffect(() => {
    loadData();
  }, [session?.churchId]);

  async function loadData() {
    if (!session?.churchId) return;
    setLoading(true);
    const tbl = table.startsWith("[") ? table.slice(1, -1) : table;
    const data = await db.rawQuery(
      `SELECT * FROM "${tbl}" WHERE church_id = ? ORDER BY ${orderBy}`,
      [session.churchId]
    );
    setRows(data);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      searchFields.some((f) =>
        String(r[f] || "").toLowerCase().includes(q)
      )
    );
  }, [rows, search, searchFields]);

  async function handleDelete(id: string) {
    if (!confirm(`Delete this ${title.toLowerCase().replace(/s$/, "")} record?`)) return;
    const tbl = table.startsWith("[") ? table.slice(1, -1) : table;
    await db.delete(tbl, id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    showToast("Record deleted");
  }

  function renderCell(row: any, col: Column) {
    const val = row[col.key];
    if (val == null || val === "") return <span className="text-ink-faint">—</span>;
    if (col.format === "date") return <span className="text-xs">{formatDate(val)}</span>;
    if (col.format === "currency") return <span className="font-semibold text-success">{formatCurrency(Number(val))}</span>;
    if (col.format === "status") {
      const colors: Record<string, string> = {
        active: "badge-success", inactive: "badge-muted", visitor: "badge-info",
        pending: "badge-gold", completed: "badge-success", cancelled: "badge-danger",
        draft: "badge-muted", published: "badge-success", sent: "badge-primary",
        open: "badge-info", closed: "badge-muted", ongoing: "badge-primary",
      };
      return (
        <span className={cn("badge", colors[val] || "badge-muted")}>
          {val}
        </span>
      );
    }
    return String(val).length > 60 ? String(val).slice(0, 60) + "…" : String(val);
  }

  return (
    <PageShell title={title}>
      <PageHeader title={title}>
        {webPath && (
          <button
            onClick={() => window.api?.openExternal(`https://worshiphq.app/app/${webPath}`)}
            className="btn-ghost btn-sm">
            <ExternalLink className="size-3.5" /> Open on web
          </button>
        )}
        {canAdd && (
          <button onClick={() => { setEditRow(null); setShowForm(true); }} className="btn-primary btn-sm">
            <Plus className="size-3.5" /> Add
          </button>
        )}
      </PageHeader>

      {/* Search bar */}
      {searchFields.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`} className="input pl-9 h-9" />
          </div>
          <span className="text-xs text-ink-faint">{filtered.length} records</span>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-primary-bright whq-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-ink">
              {search ? "No results found" : emptyMessage || `No ${title.toLowerCase()} yet`}
            </p>
            <p className="mt-1 text-xs text-ink-muted">Sync to pull data from the cloud, or add records manually.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                {columns.map((col) => (
                  <th key={col.key} className={cn(
                    "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint",
                    col.className
                  )}>{col.label}</th>
                ))}
                {canDelete && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((row, i) => (
                <tr key={row.id || i}
                  onClick={() => { setEditRow(row); setShowForm(true); }}
                  className="cursor-pointer transition-colors hover:bg-surface-2/50 group">
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3 text-ink", col.className)}>
                      {renderCell(row, col)}
                    </td>
                  ))}
                  {canDelete && (
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                        className="grid size-7 place-items-center rounded-lg text-ink-faint opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger transition-all">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditRow(null); }}
        title={editRow ? `Edit ${title.replace(/s$/, "")}` : `Add ${title.replace(/s$/, "")}`}>
        <GenericForm
          table={table}
          columns={columns}
          churchId={session!.churchId}
          editRow={editRow}
          onClose={() => { setShowForm(false); setEditRow(null); }}
          onSaved={() => { setShowForm(false); setEditRow(null); loadData(); }}
        />
      </Modal>
    </PageShell>
  );
}

function GenericForm({
  table, columns, churchId, editRow, onClose, onSaved,
}: {
  table: string; columns: Column[]; churchId: string;
  editRow: any | null; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const editableColumns = columns.filter((c) => c.key !== "created_at" && c.key !== "updated_at");

  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    editableColumns.forEach((c) => {
      init[c.key] = editRow ? String(editRow[c.key] || "") : "";
    });
    return init;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const tbl = table.startsWith("[") ? table.slice(1, -1) : table;
    const data: Record<string, any> = {};
    editableColumns.forEach((c) => {
      let val: any = form[c.key];
      if (c.format === "currency" || c.type === "number") val = Number(val) || 0;
      data[c.key] = val || null;
    });

    if (editRow?.id) {
      await db.update(tbl, editRow.id, data);
      showToast("Record updated");
    } else {
      await db.insert(tbl, { id: uuid(), church_id: churchId, ...data });
      showToast("Record added");
    }
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {editableColumns.map((col) => (
        <div key={col.key}>
          <label className="block text-xs font-medium text-ink-muted mb-1">{col.label}</label>
          {col.format === "status" || col.type === "select" ? (
            <select value={form[col.key]} onChange={set(col.key)} className="input">
              <option value="">—</option>
              {(col.options || ["active", "inactive", "pending", "completed", "cancelled"]).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : col.format === "date" || col.type === "date" ? (
            <input type="date" value={form[col.key]} onChange={set(col.key)} className="input" />
          ) : col.format === "currency" || col.type === "number" ? (
            <input type="number" step="0.01" value={form[col.key]} onChange={set(col.key)} className="input" />
          ) : (
            <input type="text" value={form[col.key]} onChange={set(col.key)} className="input" />
          )}
        </div>
      ))}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : editRow ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}
