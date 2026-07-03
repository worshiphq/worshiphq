import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, HeartHandshake, Trash2, Search, Calendar, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const TYPES = ["Financial", "Medical", "Food", "Housing", "Education", "Counseling", "Other"];

export function WelfarePage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [records, setRecords] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const [rows, p] = await Promise.all([
      db.rawQuery("SELECT * FROM welfare_record WHERE church_id = ? ORDER BY date DESC LIMIT 500", [session!.churchId]),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name", [session!.churchId]),
    ]);
    setRecords(rows);
    setPeople(p);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
      r.recipient_name?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
    );
  }, [records, search]);

  const stats = useMemo(() => {
    const total = records.reduce((s, r) => s + (r.amount || 0), 0);
    const now = new Date();
    const thisMonth = records.filter((r) => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const monthTotal = thisMonth.reduce((s, r) => s + (r.amount || 0), 0);
    const uniqueRecipients = new Set(records.map((r) => r.recipient_name?.toLowerCase())).size;
    return { total, monthTotal, count: records.length, uniqueRecipients };
  }, [records]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this record?")) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    showToast("Record deleted");
    await db.delete("welfare_record", id);
  }

  return (
    <PageShell title="Welfare">
      <PageHeader title="Welfare & Benevolence" description="Track assistance provided to members and community.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Record Assistance
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Disbursed" value={formatCurrency(stats.total)} icon={HeartHandshake} color="text-primary-bright" />
        <StatCard label="This Month" value={formatCurrency(stats.monthTotal)} icon={Calendar} color="text-gold" />
        <StatCard label="Records" value={stats.count} icon={HeartHandshake} color="text-success" />
        <StatCard label="Recipients" value={stats.uniqueRecipients} icon={HeartHandshake} color="text-info" />
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-10 pl-9" placeholder="Search welfare records..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <HeartHandshake className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No records match" : "No welfare records yet"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Recipient</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Description</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{r.recipient_name}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-bright">{r.type || "—"}</span></td>
                  <td className="px-4 py-3 text-ink-muted max-w-[200px] truncate">{r.description || "—"}</td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(r); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                      <button onClick={() => handleDelete(r.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Record" : "Record Assistance"}>
        <WelfareForm churchId={session!.churchId} people={people} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function WelfareForm({ churchId, people, existing, onClose, onSaved }: { churchId: string; people: any[]; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    person_id: existing?.person_id || "", recipient_name: existing?.recipient_name || "", type: existing?.type || "Financial",
    description: existing?.description || "", amount: existing?.amount != null ? String(existing.amount) : "",
    date: existing?.date || new Date().toISOString().slice(0, 10),
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSelectMember(e: any) {
    const id = e.target.value;
    const p = people.find((x) => x.id === id);
    setForm((f) => ({ ...f, person_id: id, recipient_name: p ? `${p.first_name} ${p.last_name}` : f.recipient_name }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      person_id: form.person_id || null, recipient_name: form.recipient_name.trim(), type: form.type,
      description: form.description || null, amount: Number(form.amount) || 0, date: form.date,
    };
    if (existing) {
      await db.update("welfare_record", existing.id, data);
      showToast("Record updated");
    } else {
      await db.insert("welfare_record", { id: uuid(), church_id: churchId, ...data });
      showToast("Record saved");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Member (optional)</label>
        <select value={form.person_id} onChange={onSelectMember} className="input"><option value="">— Not a member / enter name below —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Recipient Name *</label><input value={form.recipient_name} onChange={set("recipient_name")} className="input" required placeholder="Full name" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
          <select value={form.type} onChange={set("type")} className="input">{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Amount (GHS)</label><input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Description</label><textarea value={form.description} onChange={set("description")} className="input" rows={2} placeholder="Details of assistance" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Save"}</button>
      </div>
    </form>
  );
}
