import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, CalendarDays, Users, Ticket, MapPin, Trash2,
  X, Clock, Tag,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const EVENT_TYPES = ["Service", "Seminar", "Camp", "Special", "Retreat", "Conference"];

const TYPE_COLORS: Record<string, string> = {
  Service: "bg-primary-soft text-primary-bright",
  Seminar: "bg-info/10 text-info",
  Camp: "bg-success/10 text-success",
  Special: "bg-gold/10 text-gold",
  Retreat: "bg-sky/10 text-sky",
  Conference: "bg-danger/10 text-danger",
};

export function EventsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadEvents();
  }, [session?.churchId, syncVersion]);

  async function loadEvents() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM event WHERE church_id = ? ORDER BY starts_at DESC",
      [session!.churchId]
    );
    setEvents(rows);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const totalReg = events.reduce((s, e) => s + (e.registered || 0), 0);
    const paid = events.filter((e) => e.paid).length;
    const upcoming = events.filter((e) => new Date(e.starts_at) >= new Date()).length;
    return { total: events.length, totalReg, paid, upcoming };
  }, [events]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    showToast("Event deleted");
    await db.delete("event", id);
  }

  return (
    <PageShell title="Events">
      <PageHeader title="Events & Calendar" description="Services, seminars and camps — with registration tracking.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Create Event
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Events" value={stats.total} icon={CalendarDays} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Registered" value={stats.totalReg} icon={Users} color="bg-success/10 text-success" />
        <StatCard label="Paid Events" value={stats.paid} icon={Ticket} color="bg-gold/10 text-gold" />
        <StatCard label="Upcoming" value={stats.upcoming} icon={Clock} color="bg-info/10 text-info" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-primary-bright whq-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center">
          <CalendarDays className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">No events yet</p>
          <p className="mt-1 text-xs text-ink-muted">Create your first service, seminar or camp.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-4">
            <Plus className="size-3.5" /> Create Event
          </button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-3">
          {events.map((e) => {
            const pct = e.capacity ? Math.round(((e.registered || 0) / e.capacity) * 100) : 0;
            const d = new Date(e.starts_at);
            const colorClass = TYPE_COLORS[e.type] || "bg-surface-3 text-ink-muted";
            return (
              <div key={e.id} className="card flex flex-col p-5 hover:shadow-lg transition-shadow">
                <div className="mb-3 flex items-start justify-between">
                  <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-center">
                    <span className="text-lg font-bold leading-none text-ink">{d.getDate()}</span>
                    <span className="text-[10px] uppercase text-ink-faint">
                      {d.toLocaleDateString(undefined, { month: "short" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.paid ? (
                      <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-bold text-gold">
                        {formatCurrency(e.price || 0)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-bold text-success">
                        Free
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-bold text-ink leading-snug">{e.title}</h3>

                <div className="mt-2 space-y-1 text-sm text-ink-muted">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-3.5 text-ink-faint" />
                    {formatDate(e.starts_at)} {e.time && `· ${e.time}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="size-3.5 text-ink-faint" />
                    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", colorClass)}>
                      {e.type || "Event"}
                    </span>
                  </div>
                  {e.capacity > 0 && (
                    <div className="flex items-center gap-2">
                      <Users className="size-3.5 text-ink-faint" />
                      Capacity: {e.capacity}
                    </div>
                  )}
                </div>

                {e.capacity > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{e.registered || 0} registered</span>
                      <span className="text-ink-faint">{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-bright transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4 flex justify-end">
                  <button
                    onClick={() => handleDelete(e.id, e.title)}
                    className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Event">
        <EventForm
          churchId={session!.churchId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadEvents(); }}
        />
      </Modal>
    </PageShell>
  );
}

function EventForm({ churchId, onClose, onSaved }: { churchId: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", type: "Service",
    date: new Date().toISOString().slice(0, 10), time: "09:00",
    capacity: "", price: "0", paid: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const startsAt = `${form.date}T${form.time}:00`;
    await db.insert("event", {
      id: uuid(), church_id: churchId, title: form.title.trim(), type: form.type,
      starts_at: startsAt, time: form.time, capacity: Number(form.capacity) || 0,
      price: Number(form.price) || 0, paid: form.paid ? 1 : 0, registered: 0,
    });
    showToast("Event created");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Event Title *</label>
        <input value={form.title} onChange={set("title")} className="input" placeholder="Sunday Celebration Service" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Type</label>
        <select value={form.type} onChange={set("type")} className="input">
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Date *</label>
          <input type="date" value={form.date} onChange={set("date")} className="input" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Time</label>
          <input type="time" value={form.time} onChange={set("time")} className="input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Capacity</label>
          <input type="number" value={form.capacity} onChange={set("capacity")} className="input" placeholder="500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Price (GHS)</label>
          <input type="number" step="0.01" value={form.price} onChange={set("price")} className="input" placeholder="0" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
        <input
          type="checkbox"
          checked={form.paid}
          onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))}
          className="rounded border-line"
        />
        This is a paid event
      </label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Creating..." : "Create Event"}
        </button>
      </div>
    </form>
  );
}
