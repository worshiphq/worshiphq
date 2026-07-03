import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, HandHelping, Users, Calendar, Trash2,
  CheckCircle2, Clock, User, Pencil, ChevronDown, ChevronRight,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const SHIFT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", "full-day": "Full day" };
const SHIFTS = [{ label: "Morning", value: "morning" }, { label: "Afternoon", value: "afternoon" }, { label: "Evening", value: "evening" }, { label: "Full day", value: "full-day" }];
const STATUS_STYLE: Record<string, string> = {
  assigned: "bg-primary-soft text-primary-bright", confirmed: "bg-success/10 text-success",
  swapped: "bg-gold/10 text-gold", absent: "bg-danger/10 text-danger",
};

export function VolunteersPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [rosters, setRosters] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRosterForm, setShowRosterForm] = useState(false);
  const [editingRoster, setEditingRoster] = useState<any>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [editingAssign, setEditingAssign] = useState<any>(null);
  const [slotFor, setSlotFor] = useState<any>(null);
  const [editingSlot, setEditingSlot] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [r, s, a, m] = await Promise.all([
      db.rawQuery("SELECT * FROM volunteer_roster WHERE church_id = ? ORDER BY start_date DESC", [cid]),
      db.rawQuery("SELECT vs.*, p.first_name, p.last_name FROM volunteer_slot vs LEFT JOIN person p ON vs.person_id = p.id WHERE vs.church_id = ? ORDER BY vs.date ASC", [cid]),
      db.rawQuery("SELECT va.*, p.first_name, p.last_name, p.photo_url FROM volunteer_assignment va LEFT JOIN person p ON va.person_id = p.id WHERE va.church_id = ? ORDER BY va.service_date ASC", [cid]),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name ASC, last_name ASC", [cid]),
    ]);
    setRosters(r); setSlots(s); setAssignments(a); setMembers(m);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const confirmed = assignments.filter((a) => a.confirmed).length;
    const assignedSlots = slots.filter((s) => s.person_id).length;
    return { rosters: rosters.length, slots: slots.length, assignedSlots, scheduled: assignments.length, confirmed };
  }, [rosters, slots, assignments]);

  function toggle(id: string) { setExpanded((p) => ({ ...p, [id]: !p[id] })); }

  async function handleDeleteRoster(id: string) {
    if (!confirm("Delete this roster and its slots?")) return;
    setRosters((prev) => prev.filter((r) => r.id !== id));
    showToast("Roster deleted");
    await db.delete("volunteer_roster", id);
    loadData();
  }
  async function handleDeleteSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    showToast("Slot removed");
    await db.delete("volunteer_slot", id);
  }
  async function handleDeleteAssignment(id: string) {
    if (!confirm("Remove this assignment?")) return;
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    showToast("Assignment removed");
    await db.delete("volunteer_assignment", id);
  }
  async function toggleConfirm(a: any) {
    const next = a.confirmed ? 0 : 1;
    setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, confirmed: next } : x)));
    await db.update("volunteer_assignment", a.id, { confirmed: next });
    showToast(next ? "Confirmed" : "Set to pending");
  }

  return (
    <PageShell title="Volunteers">
      <PageHeader title="Volunteers & scheduling" description="Build rosters, schedule slots and keep every team covered.">
        <button onClick={() => { setEditingAssign(null); setShowAssignForm(true); }} className="btn-secondary btn-sm">
          <Plus className="size-3.5" /> Schedule
        </button>
        <button onClick={() => { setEditingRoster(null); setShowRosterForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Roster
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Rosters" value={stats.rosters} icon={Calendar} color="text-primary-bright" />
        <StatCard label="Slots" value={stats.slots} icon={HandHelping} color="text-info" />
        <StatCard label="Scheduled" value={stats.scheduled} icon={Users} color="text-success" />
        <StatCard label="Confirmed" value={stats.confirmed} icon={CheckCircle2} color="text-gold" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : (
        <div className="grid gap-4 grid-cols-2">
          {/* Rosters + slots */}
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
                  const open = expanded[r.id] ?? false;
                  const isPast = new Date(r.end_date) < new Date();
                  return (
                    <div key={r.id} className={cn("card p-0 overflow-hidden", isPast && "opacity-70")}>
                      <div className="flex items-start justify-between p-4">
                        <button onClick={() => toggle(r.id)} className="flex flex-1 items-start gap-2 text-left">
                          {open ? <ChevronDown className="mt-1 size-4 text-ink-faint" /> : <ChevronRight className="mt-1 size-4 text-ink-faint" />}
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-ink">{r.name}</h4>
                              {r.ministry && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-bright">{r.ministry}</span>}
                              {isPast && <span className="text-[11px] text-ink-faint">(past)</span>}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-ink-faint">
                              <span className="flex items-center gap-1"><Calendar className="size-3" /> {formatDate(r.start_date)} — {formatDate(r.end_date)}</span>
                              <span className="flex items-center gap-1"><Clock className="size-3" /> {rosterSlots.length} slots</span>
                            </div>
                          </div>
                        </button>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingRoster(r); setShowRosterForm(true); }}
                            className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                          <button onClick={() => handleDeleteRoster(r.id)}
                            className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>

                      {open && (
                        <div className="border-t border-line p-4">
                          {rosterSlots.length === 0 ? (
                            <p className="mb-3 text-sm text-ink-faint">No volunteers scheduled yet.</p>
                          ) : (
                            <div className="mb-3 overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-line text-left text-[11px] text-ink-faint">
                                    <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Shift</th>
                                    <th className="pb-2 pr-3">Role</th><th className="pb-2 pr-3">Volunteer</th>
                                    <th className="pb-2 pr-3">Status</th><th className="pb-2 w-14" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {rosterSlots.map((slot) => (
                                    <tr key={slot.id} className="border-b border-line-soft">
                                      <td className="py-2 pr-3">{formatDate(slot.date)}</td>
                                      <td className="py-2 pr-3 text-ink-muted">{SHIFT_LABEL[slot.shift] ?? slot.shift}</td>
                                      <td className="py-2 pr-3 font-medium text-ink">{slot.role}</td>
                                      <td className="py-2 pr-3">{slot.first_name ? `${slot.first_name} ${slot.last_name}` : "Unassigned"}</td>
                                      <td className="py-2 pr-3">
                                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[slot.status] ?? STATUS_STYLE.assigned)}>{slot.status || "assigned"}</span>
                                      </td>
                                      <td className="py-2">
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => { setSlotFor(r); setEditingSlot(slot); }} className="grid size-6 place-items-center rounded text-ink-faint hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                                          <button onClick={() => handleDeleteSlot(slot.id)} className="grid size-6 place-items-center rounded text-ink-faint hover:text-danger" title="Delete"><Trash2 className="size-3.5" /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <button onClick={() => { setSlotFor(r); setEditingSlot(null); }} className="btn-secondary btn-sm">
                            <Plus className="size-3.5" /> Add volunteer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assignments */}
          <div>
            <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Upcoming roster</h3>
            {assignments.length === 0 ? (
              <div className="card py-10 text-center">
                <User className="mx-auto size-8 text-ink-faint/30" />
                <p className="mt-2 text-sm text-ink-muted">No one scheduled yet</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/50">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Volunteer</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Team / Role</th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {assignments.map((a) => {
                      const name = a.first_name ? `${a.first_name} ${a.last_name}` : a.person_name || "Unknown";
                      return (
                        <tr key={a.id} className="hover:bg-surface-2/50">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Avatar name={name} src={a.photo_url} size="xs" />
                              <div>
                                <div className="font-medium text-ink">{name}</div>
                                <div className="text-[11px] text-ink-faint">{a.service_date ? formatDate(a.service_date) : ""}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{a.team}{a.role ? ` · ${a.role}` : ""}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => toggleConfirm(a)}
                              className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                a.confirmed ? "bg-success/10 text-success" : "bg-gold/10 text-gold")}
                              title="Toggle confirmation">
                              {a.confirmed ? <><CheckCircle2 className="size-3" /> Confirmed</> : <><Clock className="size-3" /> Pending</>}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingAssign(a); setShowAssignForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                              <button onClick={() => handleDeleteAssignment(a.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={showRosterForm} onClose={() => { setShowRosterForm(false); setEditingRoster(null); }} title={editingRoster ? "Edit Roster" : "Create Roster"}>
        <RosterForm churchId={session!.churchId} existing={editingRoster}
          onClose={() => { setShowRosterForm(false); setEditingRoster(null); }}
          onSaved={() => { setShowRosterForm(false); setEditingRoster(null); loadData(); }} />
      </Modal>

      <Modal open={showAssignForm} onClose={() => { setShowAssignForm(false); setEditingAssign(null); }} title={editingAssign ? "Edit Assignment" : "Schedule volunteer"}>
        <AssignmentForm churchId={session!.churchId} members={members} existing={editingAssign}
          onClose={() => { setShowAssignForm(false); setEditingAssign(null); }}
          onSaved={() => { setShowAssignForm(false); setEditingAssign(null); loadData(); }} />
      </Modal>

      <Modal open={!!slotFor} onClose={() => { setSlotFor(null); setEditingSlot(null); }} title={editingSlot ? "Edit slot" : `Add volunteer to ${slotFor?.name ?? ""}`}>
        {slotFor && (
          <SlotForm churchId={session!.churchId} rosterId={slotFor.id} members={members} existing={editingSlot}
            onClose={() => { setSlotFor(null); setEditingSlot(null); }}
            onSaved={() => { setSlotFor(null); setEditingSlot(null); loadData(); }} />
        )}
      </Modal>
    </PageShell>
  );
}

function RosterForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: existing?.name || "", ministry: existing?.ministry || "",
    start_date: existing?.start_date ? existing.start_date.slice(0, 10) : today,
    end_date: existing?.end_date ? existing.end_date.slice(0, 10) : "",
    notes: existing?.notes || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const data = { name: form.name.trim(), ministry: form.ministry || null, start_date: form.start_date, end_date: form.end_date || form.start_date, notes: form.notes || null };
    if (existing) { await db.update("volunteer_roster", existing.id, data); showToast("Roster updated"); }
    else { await db.insert("volunteer_roster", { id: uuid(), church_id: churchId, ...data }); showToast("Roster created"); }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Roster Name *</label><input value={form.name} onChange={set("name")} className="input" placeholder="e.g. Sunday Ushering - July" required /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Ministry</label><input value={form.ministry} onChange={set("ministry")} className="input" placeholder="e.g. Ushering, Worship, Media" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Start Date</label><input type="date" value={form.start_date} onChange={set("start_date")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">End Date</label><input type="date" value={form.end_date} onChange={set("end_date")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><input value={form.notes} onChange={set("notes")} className="input" placeholder="Instructions or notes..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update Roster" : "Create Roster"}</button>
      </div>
    </form>
  );
}

function SlotForm({ churchId, rosterId, members, existing, onClose, onSaved }: {
  churchId: string; rosterId: string; members: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    person_id: existing?.person_id || "",
    role: existing?.role || "",
    date: existing?.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    shift: existing?.shift || "morning",
    status: existing?.status || "assigned",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.role.trim() || !form.date) return;
    setSaving(true);
    const data = { roster_id: rosterId, person_id: form.person_id || null, role: form.role.trim(), date: form.date, shift: form.shift, status: form.status };
    if (existing) { await db.update("volunteer_slot", existing.id, data); showToast("Slot updated"); }
    else { await db.insert("volunteer_slot", { id: uuid(), church_id: churchId, ...data }); showToast("Volunteer added"); }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Volunteer</label>
        <select value={form.person_id} onChange={set("person_id")} className="input">
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
        </select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Role *</label><input value={form.role} onChange={set("role")} className="input" placeholder="e.g. Usher, Sound tech, Singer" required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date *</label><input type="date" value={form.date} onChange={set("date")} className="input" required /></div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Shift</label>
          <select value={form.shift} onChange={set("shift")} className="input">{SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
        <select value={form.status} onChange={set("status")} className="input">
          {["assigned", "confirmed", "swapped", "absent"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add"}</button>
      </div>
    </form>
  );
}

function AssignmentForm({ churchId, members, existing, onClose, onSaved }: {
  churchId: string; members: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    person_id: existing?.person_id || "",
    team: existing?.team || "",
    role: existing?.role || "Volunteer",
    service_date: existing?.service_date ? existing.service_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    confirmed: !!existing?.confirmed,
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.person_id || !form.team.trim()) return;
    setSaving(true);
    const person = members.find((m) => m.id === form.person_id);
    const data = {
      person_id: form.person_id,
      person_name: person ? `${person.first_name} ${person.last_name}` : null,
      team: form.team.trim(), role: form.role || "Volunteer",
      service_date: form.service_date, confirmed: form.confirmed ? 1 : 0,
    };
    if (existing) { await db.update("volunteer_assignment", existing.id, data); showToast("Assignment updated"); }
    else { await db.insert("volunteer_assignment", { id: uuid(), church_id: churchId, ...data }); showToast("Volunteer scheduled"); }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Person *</label>
        <select value={form.person_id} onChange={set("person_id")} className="input" required>
          <option value="">Select a member…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
        </select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Team *</label><input value={form.team} onChange={set("team")} className="input" placeholder="Worship Team" required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Role</label><input value={form.role} onChange={set("role")} className="input" placeholder="Vocals" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Service date</label><input type="date" value={form.service_date} onChange={set("service_date")} className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
        <input type="checkbox" checked={form.confirmed} onChange={(e) => setForm((f) => ({ ...f, confirmed: e.target.checked }))} className="rounded border-line" />
        Mark as confirmed
      </label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Add to roster"}</button>
      </div>
    </form>
  );
}
