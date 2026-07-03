import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, UserRoundPlus, Trash2, Search, Calendar, Phone, Mail,
  Pencil, UserPlus, Link2, X,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

const PURPOSES = ["Sunday Service", "Midweek Service", "Special Event", "Counselling", "Other"];

export function VisitorsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [church, setChurch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const [rows, ch] = await Promise.all([
      db.rawQuery("SELECT * FROM visitor WHERE church_id = ? ORDER BY visit_date DESC LIMIT 500", [session!.churchId]),
      db.getById("church", session!.churchId),
    ]);
    setVisitors(rows);
    setChurch(ch);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return visitors;
    const q = search.toLowerCase();
    return visitors.filter((v) =>
      v.first_name?.toLowerCase().includes(q) || v.last_name?.toLowerCase().includes(q) ||
      v.phone?.includes(q) || v.email?.toLowerCase().includes(q) || v.purpose?.toLowerCase().includes(q)
    );
  }, [visitors, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = visitors.filter((v) => { const d = new Date(v.visit_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    return { total: visitors.length, thisMonth: thisMonth.length };
  }, [visitors]);

  async function handleDelete(v: any) {
    if (!confirm(`Delete visitor ${v.first_name} ${v.last_name}?`)) return;
    setVisitors((prev) => prev.filter((x) => x.id !== v.id));
    setEditing(null);
    showToast("Visitor deleted");
    await db.delete("visitor", v.id);
  }

  async function handleConvert(v: any) {
    if (!confirm(`Convert ${v.first_name} ${v.last_name} to a church member? They will be removed from visitors and added to the People directory.`)) return;
    setConverting(true);
    await db.insert("person", {
      id: uuid(), church_id: session!.churchId,
      first_name: v.first_name, last_name: v.last_name,
      phone: v.phone || null, email: v.email || null,
      status: "active", joined_at: new Date().toISOString(),
    });
    await db.delete("visitor", v.id);
    setConverting(false);
    setEditing(null);
    showToast("Converted to member");
    loadData();
  }

  function copyVisitorLink() {
    if (!church?.slug) return;
    const url = `https://worshiphq.app/visit/${church.slug}`;
    navigator.clipboard.writeText(url);
    showToast("Visitor form link copied");
  }

  return (
    <PageShell title="Visitors">
      <PageHeader title="Visitors" description="Track first-time and returning visitors.">
        <div className="flex gap-2">
          {church?.slug && (
            <button onClick={copyVisitorLink} className="btn-secondary btn-sm">
              <Link2 className="size-3.5" /> Copy visitor link
            </button>
          )}
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
            <Plus className="size-3.5" /> Add Visitor
          </button>
        </div>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Total Visitors" value={stats.total} icon={UserRoundPlus} color="text-primary-bright" />
        <StatCard label="This Month" value={stats.thisMonth} icon={Calendar} color="text-success" />
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-10 pl-9" placeholder="Search visitors..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <UserRoundPlus className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No visitors match" : "No visitors yet"}</p>
          <p className="mt-1 text-xs text-ink-muted">Share your visitor form link to start collecting visitor info.</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-3">
          {filtered.map((v) => (
            <div key={v.id} onClick={() => { setEditing(v); setShowForm(true); }}
              className="card group cursor-pointer p-4 space-y-2 transition-colors hover:border-primary/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-bright">
                    {v.first_name?.[0]}{v.last_name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{v.first_name} {v.last_name}</p>
                    {v.purpose && <span className="mt-0.5 inline-block badge badge-muted text-[10px]">{v.purpose}</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setEditing(v); setShowForm(true); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
                  <Pencil className="size-3.5" />
                </button>
              </div>
              <div className="space-y-1 text-xs text-ink-muted">
                {v.phone && <div className="flex items-center gap-1.5"><Phone className="size-3" /> {v.phone}</div>}
                {v.email && <div className="flex items-center gap-1.5"><Mail className="size-3" /> {v.email}</div>}
                <div className="flex items-center gap-1.5"><Calendar className="size-3" /> {formatDate(v.visit_date)}</div>
              </div>
              {v.notes && <p className="text-xs text-ink-muted italic border-t border-line-soft pt-2">&ldquo;{v.notes}&rdquo;</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Visitor" : "Add Visitor"}>
        <VisitorForm churchId={session!.churchId} existing={editing}
          converting={converting}
          onConvert={editing ? () => handleConvert(editing) : undefined}
          onDelete={editing ? () => handleDelete(editing) : undefined}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function VisitorForm({ churchId, existing, converting, onConvert, onDelete, onClose, onSaved }: {
  churchId: string; existing?: any; converting: boolean;
  onConvert?: () => void; onDelete?: () => void; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: existing?.first_name || "", last_name: existing?.last_name || "",
    phone: existing?.phone || "", email: existing?.email || "",
    purpose: existing?.purpose || "",
    visit_date: (existing?.visit_date || new Date().toISOString()).slice(0, 10),
    notes: existing?.notes || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    setSaving(true);
    const data = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      phone: form.phone || null, email: form.email || null,
      purpose: form.purpose || null, visit_date: form.visit_date, notes: form.notes || null,
    };
    if (existing) {
      await db.update("visitor", existing.id, data);
      showToast("Visitor updated");
    } else {
      const visitorId = uuid();
      await db.insert("visitor", { id: visitorId, church_id: churchId, ...data });
      // Auto-create a follow-up task (mirrors web submitVisitorForm)
      await db.insert("follow_up", {
        id: uuid(), church_id: churchId, visitor_id: visitorId,
        type: "new_visitor", title: `Follow up with visitor ${data.first_name} ${data.last_name}`,
        note: [data.purpose && `Purpose: ${data.purpose}`, data.notes && `Notes: ${data.notes}`].filter(Boolean).join(". ") || null,
        status: "open",
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });
      showToast("Visitor added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">First Name *</label><input value={form.first_name} onChange={set("first_name")} className="input" required /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Last Name *</label><input value={form.last_name} onChange={set("last_name")} className="input" required /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Phone</label><input value={form.phone} onChange={set("phone")} className="input" placeholder="0XX XXX XXXX" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Email</label><input type="email" value={form.email} onChange={set("email")} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Purpose of visit</label>
          <select value={form.purpose} onChange={set("purpose")} className="input">
            <option value="">— Select —</option>
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Visit Date</label><input type="date" value={form.visit_date} onChange={set("visit_date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes / prayer request</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add Visitor"}</button>
      </div>
      {existing && (
        <div className="flex gap-2 border-t border-line pt-3">
          <button type="button" onClick={onConvert} disabled={converting} className="btn-secondary btn-sm flex-1">
            {converting ? <Loader2 className="size-3.5 whq-spin" /> : <UserPlus className="size-3.5" />}
            {converting ? "Converting..." : "Convert to member"}
          </button>
          <button type="button" onClick={onDelete} className="btn-danger btn-sm px-3"><Trash2 className="size-3.5" /></button>
        </div>
      )}
    </form>
  );
}
