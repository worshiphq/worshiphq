import { useEffect, useState } from "react";
import { Plus, Loader2, CalendarCheck2, Users, X, Trash2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function AttendancePage() {
  const { session, showToast } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadSessions();
  }, [session?.churchId]);

  async function loadSessions() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM attendance_session WHERE church_id = ? ORDER BY date DESC LIMIT 100",
      [session!.churchId]
    );
    setSessions(rows);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this attendance session?")) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    showToast("Session deleted");
    await db.delete("attendance_session", id);
  }

  return (
    <PageShell title="Attendance">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-muted">{sessions.length} sessions recorded</p>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="size-4" /> New Session
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-primary-bright whq-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarCheck2 className="mx-auto size-10 text-ink-faint/40" />
            <p className="mt-3 text-sm text-ink-muted">No attendance sessions yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Service</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Date</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted text-center">Adults</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted text-center">Teens</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted text-center">Children</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted text-center">Visitors</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted text-center">Total</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((s) => {
                const total = (s.adults || 0) + (s.teens || 0) + (s.children || 0) + (s.visitors || 0);
                return (
                  <tr key={s.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-2.5 font-medium text-ink">{s.service_name}</td>
                    <td className="px-4 py-2.5 text-ink-muted text-xs">{formatDate(s.date)}</td>
                    <td className="px-4 py-2.5 text-center text-ink-muted">{s.adults}</td>
                    <td className="px-4 py-2.5 text-center text-ink-muted">{s.teens}</td>
                    <td className="px-4 py-2.5 text-center text-ink-muted">{s.children}</td>
                    <td className="px-4 py-2.5 text-center text-ink-muted">{s.visitors}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-ink">{total}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDelete(s.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <SessionForm
          churchId={session!.churchId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadSessions(); }}
        />
      )}
    </PageShell>
  );
}

function SessionForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    service_name: "Sunday Service",
    date: new Date().toISOString().slice(0, 10),
    adults: "0",
    teens: "0",
    children: "0",
    visitors: "0",
    note: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("attendance_session", {
      id: uuid(),
      church_id: churchId,
      service_name: form.service_name,
      date: form.date,
      adults: Number(form.adults),
      teens: Number(form.teens),
      children: Number(form.children),
      visitors: Number(form.visitors),
      note: form.note || null,
    });
    showToast("Attendance recorded");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Record Attendance</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-3">
            <X className="size-4 text-ink-faint" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Service Name</label>
              <input value={form.service_name} onChange={set("service_name")} className="input" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Date</label>
              <input type="date" value={form.date} onChange={set("date")} className="input" required />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(["adults", "teens", "children", "visitors"] as const).map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-ink-muted mb-1 capitalize">{key}</label>
                <input type="number" min="0" value={form[key]} onChange={set(key)} className="input text-center" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
            <input value={form.note} onChange={set("note")} className="input" placeholder="Optional" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving && <Loader2 className="size-4 whq-spin" />}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
