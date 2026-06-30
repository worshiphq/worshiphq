import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, CalendarCheck, Trash2, Search, Clock, CheckCircle2,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function BookingsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM booking WHERE church_id = ? ORDER BY start_time DESC LIMIT 500", [session!.churchId]);
    setBookings(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return bookings;
    const q = search.toLowerCase();
    return bookings.filter((b) => b.title?.toLowerCase().includes(q) || b.booked_by?.toLowerCase().includes(q));
  }, [bookings, search]);

  const stats = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const pending = bookings.filter((b) => b.status === "pending" || !b.status).length;
    return { total: bookings.length, confirmed, pending };
  }, [bookings]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this booking?")) return;
    setBookings((prev) => prev.filter((b) => b.id !== id));
    showToast("Booking deleted");
    await db.delete("booking", id);
  }

  return (
    <PageShell title="Bookings">
      <PageHeader title="Facility Bookings" description="Manage venue and facility reservations.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Booking
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total" value={stats.total} icon={CalendarCheck} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Confirmed" value={stats.confirmed} icon={CheckCircle2} color="bg-success/10 text-success" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="bg-gold/10 text-gold" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search bookings..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarCheck className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No bookings match" : "No bookings yet"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Booking</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Booked By</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Start</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">End</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{b.title}</td>
                  <td className="px-4 py-3 text-ink-muted">{b.booked_by || "—"}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(b.start_time)}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(b.end_time)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                      b.status === "confirmed" ? "bg-success/10 text-success" :
                      b.status === "cancelled" ? "bg-danger/10 text-danger" :
                      "bg-gold/10 text-gold"
                    )}>{b.status || "pending"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(b.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Booking">
        <BookingForm churchId={session!.churchId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function BookingForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", booked_by: "", start_time: "", end_time: "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await db.insert("booking", {
      id: uuid(), church_id: churchId, title: form.title.trim(),
      booked_by: form.booked_by || null,
      start_time: form.start_time || null, end_time: form.end_time || null,
      status: "pending",
    });
    showToast("Booking created"); setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="e.g. Youth Hall booking" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Booked By</label><input value={form.booked_by} onChange={set("booked_by")} className="input" placeholder="Name" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Start</label><input type="datetime-local" value={form.start_time} onChange={set("start_time")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">End</label><input type="datetime-local" value={form.end_time} onChange={set("end_time")} className="input" /></div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Creating..." : "Create"}</button>
      </div>
    </form>
  );
}
