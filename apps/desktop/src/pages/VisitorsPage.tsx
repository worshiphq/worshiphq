import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, UserPlus, Trash2, Search, Calendar, Phone,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function VisitorsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM visitor WHERE church_id = ? ORDER BY visit_date DESC LIMIT 500", [session!.churchId]);
    setVisitors(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return visitors;
    const q = search.toLowerCase();
    return visitors.filter((v) =>
      v.first_name?.toLowerCase().includes(q) || v.last_name?.toLowerCase().includes(q) ||
      v.phone?.includes(q) || v.email?.toLowerCase().includes(q)
    );
  }, [visitors, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = visitors.filter((v) => { const d = new Date(v.visit_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    return { total: visitors.length, thisMonth: thisMonth.length };
  }, [visitors]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this visitor?")) return;
    setVisitors((prev) => prev.filter((v) => v.id !== id));
    showToast("Visitor deleted");
    await db.delete("visitor", id);
  }

  return (
    <PageShell title="Visitors">
      <PageHeader title="Visitors" description="Track first-time and returning visitors.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Visitor
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Total Visitors" value={stats.total} icon={UserPlus} color="bg-primary-soft text-primary-bright" />
        <StatCard label="This Month" value={stats.thisMonth} icon={Calendar} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search visitors..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <UserPlus className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No visitors match" : "No visitors recorded yet"}</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-3">
          {filtered.map((v) => (
            <div key={v.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary-bright font-bold text-sm">
                    {(v.first_name?.[0] || "").toUpperCase()}{(v.last_name?.[0] || "").toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-ink">{v.first_name} {v.last_name}</h3>
                    {v.phone && <p className="text-xs text-ink-muted flex items-center gap-1"><Phone className="size-3" />{v.phone}</p>}
                    {v.email && <p className="text-xs text-ink-faint">{v.email}</p>}
                  </div>
                </div>
                <button onClick={() => handleDelete(v.id)} className="grid size-6 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-3" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint">
                <span>Visited: {formatDate(v.visit_date)}</span>
                {v.invited_by && <span>Invited by: {v.invited_by}</span>}
              </div>
              {v.notes && <p className="mt-2 text-xs text-ink-muted border-t border-line pt-2">{v.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Visitor">
        <VisitorForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function VisitorForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", visit_date: new Date().toISOString().slice(0, 10), invited_by: "", notes: "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("visitor", {
      id: uuid(), church_id: churchId,
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      phone: form.phone || null, email: form.email || null,
      visit_date: form.visit_date, invited_by: form.invited_by || null,
      notes: form.notes || null,
    });
    showToast("Visitor added"); setSaving(false); onSaved();
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
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Visit Date</label><input type="date" value={form.visit_date} onChange={set("visit_date")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Invited By</label><input value={form.invited_by} onChange={set("invited_by")} className="input" placeholder="Member name" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><textarea value={form.notes} onChange={set("notes")} className="input" rows={2} /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Adding..." : "Add Visitor"}</button>
      </div>
    </form>
  );
}
