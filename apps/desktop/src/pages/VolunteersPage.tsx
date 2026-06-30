import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, HandHelping, Users, Calendar, Trash2,
  Search, CheckCircle2, Clock, User,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function VolunteersPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [rosters, setRosters] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [r, s, a] = await Promise.all([
      db.rawQuery("SELECT * FROM volunteer_roster WHERE church_id = ? ORDER BY start_date DESC", [cid]),
      db.rawQuery("SELECT * FROM volunteer_slot WHERE church_id = ? ORDER BY date ASC", [cid]),
      db.rawQuery("SELECT va.*, p.first_name, p.last_name FROM volunteer_assignment va LEFT JOIN person p ON va.person_id = p.id WHERE va.church_id = ?", [cid]),
    ]);
    setRosters(r);
    setSlots(s);
    setAssignments(a);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const uniqueVolunteers = new Set(assignments.map((a) => a.person_id));
    const confirmed = assignments.filter((a) => a.confirmed).length;
    return {
      rosters: rosters.length,
      volunteers: uniqueVolunteers.size,
      slots: slots.length,
      confirmed,
    };
  }, [rosters, slots, assignments]);

  async function handleDeleteRoster(id: string) {
    if (!confirm("Delete this roster?")) return;
    setRosters((prev) => prev.filter((r) => r.id !== id));
    showToast("Roster deleted");
    await db.delete("volunteer_roster", id);
  }

  return (
    <PageShell title="Volunteers">
      <PageHeader title="Volunteers" description="Manage volunteer rosters and assignments.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Roster
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Rosters" value={stats.rosters} icon={Calendar} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Volunteers" value={stats.volunteers} icon={Users} color="bg-success/10 text-success" />
        <StatCard label="Slots" value={stats.slots} icon={HandHelping} color="bg-info/10 text-info" />
        <StatCard label="Confirmed" value={stats.confirmed} icon={CheckCircle2} color="bg-gold/10 text-gold" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-primary-bright whq-spin" />
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2">
          {/* Rosters column */}
          <div>
            <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Rosters</h3>
            {rosters.length === 0 ? (
              <div className="card py-10 text-center">
                <HandHelping className="mx-auto size-8 text-ink-faint/30" />
                <p className="mt-2 text-sm text-ink-muted">No rosters yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rosters.map((r) => {
                  const rosterSlots = slots.filter((s) => s.roster_id === r.id);
                  return (
                    <div key={r.id} className="card p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-ink">{r.name}</h4>
                          <p className="text-xs text-ink-muted">{r.ministry || "General"}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteRoster(r.id)}
                          className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {formatDate(r.start_date)} — {formatDate(r.end_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> {rosterSlots.length} slots
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming assignments column */}
          <div>
            <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Assignments</h3>
            {assignments.length === 0 ? (
              <div className="card py-10 text-center">
                <User className="mx-auto size-8 text-ink-faint/30" />
                <p className="mt-2 text-sm text-ink-muted">No assignments yet</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/50">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Volunteer</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Role</th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {assignments.slice(0, 20).map((a) => (
                      <tr key={a.id} className="hover:bg-surface-2/50">
                        <td className="px-3 py-2 font-medium text-ink">
                          {a.first_name ? `${a.first_name} ${a.last_name}` : "Unknown"}
                        </td>
                        <td className="px-3 py-2 text-ink-muted">{a.role || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {a.confirmed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                              <CheckCircle2 className="size-3" /> Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold">
                              <Clock className="size-3" /> Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Roster">
        <RosterForm
          churchId={session!.churchId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      </Modal>
    </PageShell>
  );
}

function RosterForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: "", ministry: "", start_date: today, end_date: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await db.insert("volunteer_roster", {
      id: uuid(), church_id: churchId, name: form.name.trim(),
      ministry: form.ministry || null, start_date: form.start_date,
      end_date: form.end_date || null,
    });
    showToast("Roster created");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Roster Name *</label>
        <input value={form.name} onChange={set("name")} className="input" placeholder="e.g. July Ushering Roster" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Ministry</label>
        <input value={form.ministry} onChange={set("ministry")} className="input" placeholder="e.g. Ushering, Worship, Media" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Start Date</label>
          <input type="date" value={form.start_date} onChange={set("start_date")} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">End Date</label>
          <input type="date" value={form.end_date} onChange={set("end_date")} className="input" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Creating..." : "Create Roster"}
        </button>
      </div>
    </form>
  );
}
