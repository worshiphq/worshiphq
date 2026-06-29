import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, CalendarCheck2, Users, X, Trash2, TrendingUp,
  Baby, GraduationCap, UserPlus,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
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
      "SELECT * FROM attendance_session WHERE church_id = ? ORDER BY date DESC LIMIT 200",
      [session!.churchId]
    );
    setSessions(rows);
    setLoading(false);
  }

  const stats = useMemo(() => {
    if (!sessions.length) return { latest: 0, avg: 0, peak: 0, totalSessions: 0 };
    const totals = sessions.map((s) => (s.adults || 0) + (s.teens || 0) + (s.children || 0) + (s.visitors || 0));
    return {
      latest: totals[0] || 0,
      avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      peak: Math.max(...totals),
      totalSessions: sessions.length,
    };
  }, [sessions]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this attendance session?")) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    showToast("Session deleted");
    await db.delete("attendance_session", id);
  }

  return (
    <PageShell title="Attendance">
      <PageHeader title="Attendance" description="Track service and event attendance.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Session
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Latest" value={stats.latest} icon={CalendarCheck2} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Average" value={stats.avg} icon={TrendingUp} color="bg-success/10 text-success" />
        <StatCard label="Peak" value={stats.peak} icon={Users} color="bg-gold/10 text-gold" />
        <StatCard label="Sessions" value={stats.totalSessions} icon={CalendarCheck2} color="bg-info/10 text-info" />
      </div>

      {/* Sessions table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-primary-bright whq-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarCheck2 className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">No attendance sessions yet</p>
            <p className="mt-1 text-xs text-ink-muted">Record your first session or sync with the cloud.</p>
            <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-4">
              <Plus className="size-3.5" /> New Session
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Service</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  <div className="flex items-center justify-center gap-1"><Users className="size-3" /> Adults</div>
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  <div className="flex items-center justify-center gap-1"><GraduationCap className="size-3" /> Teens</div>
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  <div className="flex items-center justify-center gap-1"><Baby className="size-3" /> Children</div>
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  <div className="flex items-center justify-center gap-1"><UserPlus className="size-3" /> Visitors</div>
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {sessions.map((s) => {
                const total = (s.adults || 0) + (s.teens || 0) + (s.children || 0) + (s.visitors || 0);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium text-ink">{s.service_name}</td>
                    <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(s.date)}</td>
                    <td className="px-4 py-3 text-center text-ink-muted">{s.adults}</td>
                    <td className="px-4 py-3 text-center text-ink-muted">{s.teens}</td>
                    <td className="px-4 py-3 text-center text-ink-muted">{s.children}</td>
                    <td className="px-4 py-3 text-center text-ink-muted">{s.visitors}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary-bright">
                        {total}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(s.id)}
                        className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Attendance">
        <SessionForm
          churchId={session!.churchId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadSessions(); }}
        />
      </Modal>
    </PageShell>
  );
}

function SessionForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    service_name: "Sunday Service",
    date: new Date().toISOString().slice(0, 10),
    adults: "0", teens: "0", children: "0", visitors: "0", note: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("attendance_session", {
      id: uuid(), church_id: churchId, service_name: form.service_name, date: form.date,
      adults: Number(form.adults), teens: Number(form.teens),
      children: Number(form.children), visitors: Number(form.visitors),
      note: form.note || null,
    });
    showToast("Attendance recorded");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
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
  );
}
