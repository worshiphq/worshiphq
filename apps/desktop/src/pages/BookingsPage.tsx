import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, CalendarCheck, Trash2, Search, Clock, User, MapPin,
  Building, DoorOpen, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

function formatDateTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function BookingsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [bookings, setBookings] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"bookings" | "facilities">("bookings");
  const [showBooking, setShowBooking] = useState(false);
  const [showFacility, setShowFacility] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any>(null);
  const [editingFacility, setEditingFacility] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const [b, f] = await Promise.all([
      db.rawQuery(
        "SELECT bk.*, f.name AS facility_name FROM booking bk LEFT JOIN facility f ON bk.facility_id = f.id WHERE bk.church_id = ? AND (bk.start_time >= ? OR bk.end_time >= ?) ORDER BY bk.start_time DESC LIMIT 500",
        [cid, cutoff, cutoff]
      ),
      db.rawQuery("SELECT * FROM facility WHERE church_id = ? ORDER BY name ASC", [cid]),
    ]);
    setBookings(b);
    setFacilities(f);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return bookings;
    const q = search.toLowerCase();
    return bookings.filter((b) =>
      b.title?.toLowerCase().includes(q) ||
      b.booked_by?.toLowerCase().includes(q) ||
      b.facility_name?.toLowerCase().includes(q)
    );
  }, [bookings, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const upcoming = bookings.filter((b) => b.end_time && new Date(b.end_time) >= now).length;
    return { total: bookings.length, upcoming, facilities: facilities.length };
  }, [bookings, facilities]);

  async function handleDeleteBooking(id: string) {
    if (!confirm("Delete this booking?")) return;
    setBookings((prev) => prev.filter((b) => b.id !== id));
    showToast("Booking deleted");
    await db.delete("booking", id);
  }

  async function handleDeleteFacility(id: string) {
    if (!confirm("Delete this facility? Its bookings will also be removed.")) return;
    setFacilities((prev) => prev.filter((f) => f.id !== id));
    showToast("Facility deleted");
    await db.delete("facility", id);
    loadData();
  }

  return (
    <PageShell title="Bookings">
      <PageHeader title="Facility Bookings" description="Manage room and facility reservations.">
        <button onClick={() => { setEditingFacility(null); setShowFacility(true); }} className="btn-secondary btn-sm">
          <Building className="size-3.5" /> Add facility
        </button>
        <button
          onClick={() => { setEditingBooking(null); setShowBooking(true); }}
          disabled={facilities.length === 0}
          className="btn-primary btn-sm disabled:opacity-50"
          title={facilities.length === 0 ? "Add a facility first" : ""}
        >
          <Plus className="size-3.5" /> Book
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Bookings" value={stats.total} icon={CalendarCheck} color="text-primary-bright" />
        <StatCard label="Upcoming" value={stats.upcoming} icon={Clock} color="text-success" />
        <StatCard label="Facilities" value={stats.facilities} icon={Building} color="text-gold" />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab("bookings")}
          className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === "bookings" ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted")}>
          Bookings ({bookings.length})
        </button>
        <button onClick={() => setTab("facilities")}
          className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === "facilities" ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted")}>
          Facilities ({facilities.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : tab === "bookings" ? (
        <>
          <div className="mb-4 relative max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search bookings..." />
          </div>

          {filtered.length === 0 ? (
            <div className="card py-16 text-center">
              <DoorOpen className="mx-auto size-10 text-ink-faint/30" />
              <p className="mt-3 text-sm font-medium text-ink">{search ? "No bookings match your search" : "No bookings yet"}</p>
              {!search && <p className="mt-1 text-xs text-ink-muted">Add facilities first, then create bookings.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((b) => {
                const isPast = b.end_time && new Date(b.end_time) < new Date();
                return (
                  <div key={b.id} className={cn("card p-4", isPast && "opacity-70")}>
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", isPast ? "bg-ink-faint/10 text-ink-faint" : "bg-primary-soft text-primary-bright")}>
                        <DoorOpen className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{b.title}</span>
                          {b.facility_name && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">{b.facility_name}</span>}
                          {isPast && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-ink-faint">Past</span>}
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                            b.status === "confirmed" ? "bg-success/10 text-success" :
                            b.status === "cancelled" ? "bg-danger/10 text-danger" : "bg-gold/10 text-gold")}>
                            {b.status || "pending"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                          <span className="flex items-center gap-1"><Clock className="size-3" /> {formatDateTime(b.start_time)} — {formatDateTime(b.end_time)}</span>
                          {b.booked_by && <span className="flex items-center gap-1"><User className="size-3" /> {b.booked_by}</span>}
                        </div>
                        {b.notes && <p className="mt-1 text-xs text-ink-muted">{b.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => { setEditingBooking(b); setShowBooking(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                        <button onClick={() => handleDeleteBooking(b.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        // Facilities tab
        facilities.length === 0 ? (
          <div className="card py-16 text-center">
            <Building className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">No facilities registered yet</p>
            <p className="mt-1 text-xs text-ink-muted">Add rooms or spaces to enable bookings.</p>
            <button onClick={() => { setEditingFacility(null); setShowFacility(true); }} className="btn-primary btn-sm mt-4">
              <Building className="size-3.5" /> Add facility
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {facilities.map((f) => (
              <div key={f.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{f.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                      {f.capacity ? <span>Capacity: {f.capacity}</span> : null}
                      {f.location ? <span className="flex items-center gap-1"><MapPin className="size-3" /> {f.location}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => { setEditingFacility(f); setShowFacility(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                    <button onClick={() => handleDeleteFacility(f.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Modal open={showBooking} onClose={() => { setShowBooking(false); setEditingBooking(null); }} title={editingBooking ? "Edit Booking" : "Book a facility"}>
        <BookingForm churchId={session!.churchId} facilities={facilities} existing={editingBooking}
          onClose={() => { setShowBooking(false); setEditingBooking(null); }}
          onSaved={() => { setShowBooking(false); setEditingBooking(null); loadData(); }} />
      </Modal>

      <Modal open={showFacility} onClose={() => { setShowFacility(false); setEditingFacility(null); }} title={editingFacility ? "Edit Facility" : "Add facility"}>
        <FacilityForm churchId={session!.churchId} existing={editingFacility}
          onClose={() => { setShowFacility(false); setEditingFacility(null); }}
          onSaved={() => { setShowFacility(false); setEditingFacility(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function BookingForm({ churchId, facilities, existing, onClose, onSaved }: {
  churchId: string; facilities: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "",
    facility_id: existing?.facility_id || (facilities[0]?.id ?? ""),
    booked_by: existing?.booked_by || "",
    start_time: existing?.start_time ? existing.start_time.slice(0, 16) : "",
    end_time: existing?.end_time ? existing.end_time.slice(0, 16) : "",
    notes: existing?.notes || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.facility_id) return;
    setSaving(true);
    const data = {
      title: form.title.trim(), facility_id: form.facility_id, booked_by: form.booked_by || null,
      start_time: form.start_time || null, end_time: form.end_time || null, notes: form.notes || null,
    };
    if (existing) {
      await db.update("booking", existing.id, data);
      showToast("Booking updated");
    } else {
      await db.insert("booking", { id: uuid(), church_id: churchId, ...data, status: "confirmed" });
      showToast("Booking created");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Event title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="What's happening" /></div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Facility *</label>
        <select value={form.facility_id} onChange={set("facility_id")} className="input" required>
          {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}{f.capacity ? ` (${f.capacity} capacity)` : ""}</option>)}
        </select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Booked by</label><input value={form.booked_by} onChange={set("booked_by")} className="input" placeholder="Name or group" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Start</label><input type="datetime-local" value={form.start_time} onChange={set("start_time")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">End</label><input type="datetime-local" value={form.end_time} onChange={set("end_time")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Notes</label><input value={form.notes} onChange={set("notes")} className="input" placeholder="Additional details..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Book"}</button>
      </div>
    </form>
  );
}

function FacilityForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: existing?.name || "", capacity: String(existing?.capacity ?? ""), location: existing?.location || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const data = { name: form.name.trim(), capacity: form.capacity ? Number(form.capacity) : null, location: form.location || null };
    if (existing) {
      await db.update("facility", existing.id, data);
      showToast("Facility updated");
    } else {
      await db.insert("facility", { id: uuid(), church_id: churchId, ...data, is_active: 1 });
      showToast("Facility added");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Name *</label><input value={form.name} onChange={set("name")} className="input" required placeholder="e.g. Main hall" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Capacity</label><input type="number" value={form.capacity} onChange={set("capacity")} className="input" placeholder="0" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Location</label><input value={form.location} onChange={set("location")} className="input" placeholder="Building or floor" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Save"}</button>
      </div>
    </form>
  );
}
