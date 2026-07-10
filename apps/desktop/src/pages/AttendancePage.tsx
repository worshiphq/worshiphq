import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, CalendarCheck2, Users, X, TrendingUp,
  UserPlus, UserCheck, Search, Copy, Check, QrCode, ChevronRight, MapPin,
  Pencil, Trash2, Play,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CATEGORY_FIELD: Record<string, "adults" | "teens" | "children" | "visitors"> = {
  adult: "adults", teen: "teens", child: "children", visitor: "visitors",
};

/** Derive an attendance category from a person's DOB/status (mirrors web categoryForPerson). */
function categoryForPerson(p: { status?: string | null; date_of_birth?: string | null; birthday?: string | null }): string {
  if (p.status === "visitor") return "visitor";
  const dob = p.date_of_birth;
  if (!dob) return "adult";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "adult";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 13) return "child";
  if (age < 18) return "teen";
  return "adult";
}

export function AttendancePage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [startingCheckIn, setStartingCheckIn] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadSessions();
  }, [session?.churchId, syncVersion]);

  /** One-click: create (or reuse) today's service and open its check-in panel. */
  async function startCheckIn() {
    setStartingCheckIn(true);
    const today = new Date().toISOString().slice(0, 10);
    const existing = await db.rawQuery(
      "SELECT id FROM attendance_session WHERE church_id = ? AND date LIKE ? ORDER BY date DESC LIMIT 1",
      [session!.churchId, today + "%"],
    );
    let id = existing[0]?.id;
    if (!id) {
      id = uuid();
      await db.insert("attendance_session", {
        id, church_id: session!.churchId,
        service_name: "Sunday Service", date: today,
        adults: 0, teens: 0, children: 0, visitors: 0, note: null,
      });
      showToast("Check-in started");
      await loadSessions();
    }
    setStartingCheckIn(false);
    setDetailId(id);
  }

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
    if (!sessions.length) return { thisWeek: 0, thisMonth: 0, avg: 0, totalSessions: 0 };
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalOf = (s: any) => (s.adults || 0) + (s.teens || 0) + (s.children || 0) + (s.visitors || 0);
    const totals = sessions.map(totalOf);
    return {
      thisWeek: sessions.filter((s) => new Date(s.date) >= weekAgo).reduce((a, s) => a + totalOf(s), 0),
      thisMonth: sessions.filter((s) => new Date(s.date) >= startOfMonth).reduce((a, s) => a + totalOf(s), 0),
      avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      totalSessions: sessions.length,
    };
  }, [sessions]);

  // 6-month trend
  const trend = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_ABBR[d.getMonth()], total: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const s of sessions) {
      const key = (s.date || "").slice(0, 7);
      const i = idx.get(key);
      if (i !== undefined) buckets[i].total += (s.adults || 0) + (s.teens || 0) + (s.children || 0) + (s.visitors || 0);
    }
    return buckets;
  }, [sessions]);

  const maxTrend = Math.max(...trend.map((t) => t.total), 1);
  const mostRecent = sessions[0] ?? null;

  return (
    <PageShell title="Attendance">
      <PageHeader title="Attendance" description="Record and track who's gathering, service by service.">
        <button onClick={startCheckIn} disabled={startingCheckIn} className="btn-secondary btn-sm">
          {startingCheckIn ? <Loader2 className="size-3.5 whq-spin" /> : <Play className="size-3.5" />}
          {startingCheckIn ? "Starting..." : "Start check-in"}
        </button>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Record service
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This week" value={stats.thisWeek} icon={UserCheck} color="text-primary-bright" />
        <StatCard label="This month" value={stats.thisMonth} icon={CalendarCheck2} color="text-success" />
        <StatCard label="Avg / service" value={stats.avg} icon={TrendingUp} color="text-gold" />
        <StatCard label="Services logged" value={stats.totalSessions} icon={Users} color="text-info" />
      </div>

      {/* Most recent service */}
      {!loading && sessions.length > 0 && mostRecent && (
        <button
          onClick={() => setDetailId(mostRecent.id)}
          className="mt-4 block w-full text-left"
        >
          <div className="card group flex flex-wrap items-center justify-between gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
                <CalendarCheck2 className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">{mostRecent.service_name}</h3>
                  <span className="badge badge-primary px-2 py-0 text-[10px]">Most recent</span>
                </div>
                <p className="text-sm text-ink-muted">
                  {formatDate(mostRecent.date)}
                  {mostRecent.branch && (
                    <span className="ml-2 inline-flex items-center gap-1 text-ink-faint">
                      <MapPin className="size-3" /> {mostRecent.branch}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="font-display text-2xl font-bold">{(mostRecent.adults || 0) + (mostRecent.teens || 0) + (mostRecent.children || 0) + (mostRecent.visitors || 0)}</div>
                <div className="text-xs text-ink-faint">present</div>
              </div>
              <ChevronRight className="size-5 text-ink-faint transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </button>
      )}

      {/* Trend + history */}
      {!loading && sessions.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="card lg:col-span-2">
            <div className="border-b border-line p-5">
              <h3 className="font-display text-lg font-semibold">Attendance trend</h3>
              <p className="text-sm text-ink-muted">Total present by month</p>
            </div>
            <div className="flex h-28 items-end gap-2 p-3">
              {trend.map((t) => {
                const h = Math.max((t.total / maxTrend) * 100, 4);
                return (
                  <div key={t.key} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-primary-bright">{t.total || ""}</span>
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-primary/30 to-primary-bright/60 transition-all" style={{ height: `${h}%` }} />
                    <span className="text-[10px] text-ink-faint">{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Service history</h3></div>
            <div className="max-h-80 divide-y divide-line-soft overflow-y-auto">
              {sessions.slice(1).length === 0 && <div className="p-6 text-sm text-ink-faint">No earlier services yet.</div>}
              {sessions.slice(1).map((s) => {
                const total = (s.adults || 0) + (s.teens || 0) + (s.children || 0) + (s.visitors || 0);
                return (
                  <button key={s.id} onClick={() => setDetailId(s.id)} className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-surface-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.service_name}</div>
                      <div className="text-xs text-ink-faint">{formatDate(s.date)}</div>
                    </div>
                    <span className="flex items-center gap-2 text-sm text-ink-muted">{total} <ChevronRight className="size-4 text-ink-faint" /></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center">
          <h3 className="font-display text-lg font-semibold">Start tracking attendance</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">Use <strong>Record service</strong> for a quick headcount. Each service gets its own dashboard.</p>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary btn-sm mt-4">
            <Plus className="size-3.5" /> Record service
          </button>
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Attendance" : "Record Attendance"}>
        <SessionForm
          churchId={session!.churchId}
          existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadSessions(); }}
        />
      </Modal>

      {detailId && (
        <SessionDetailModal
          sessionId={detailId}
          churchId={session!.churchId}
          serverUrl={session?.serverUrl ?? ""}
          onClose={() => setDetailId(null)}
          onChanged={loadSessions}
          onEdit={(s: any) => { setDetailId(null); setEditing(s); setShowForm(true); }}
        />
      )}
    </PageShell>
  );
}

function SessionForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => {
    if (existing) {
      return {
        service_name: existing.service_name || "Sunday Service",
        date: existing.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        adults: String(existing.adults ?? 0), teens: String(existing.teens ?? 0),
        children: String(existing.children ?? 0), visitors: String(existing.visitors ?? 0),
        note: existing.note || "",
      };
    }
    return { service_name: "Sunday Service", date: new Date().toISOString().slice(0, 10), adults: "0", teens: "0", children: "0", visitors: "0", note: "" };
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      service_name: form.service_name, date: form.date,
      adults: Number(form.adults), teens: Number(form.teens),
      children: Number(form.children), visitors: Number(form.visitors),
      note: form.note || null,
    };
    if (existing) {
      await db.update("attendance_session", existing.id, data);
      showToast("Attendance updated");
    } else {
      await db.insert("attendance_session", { id: uuid(), church_id: churchId, ...data });
      showToast("Attendance recorded");
    }
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          {saving ? "Saving..." : (existing ? "Save Changes" : "Save")}
        </button>
      </div>
    </form>
  );
}

const CATEGORY_LABEL: Record<string, string> = { adult: "Adult", teen: "Teen", child: "Child", visitor: "Visitor" };

/** Session detail: demographic breakdown + per-member check-in (mirrors web CheckInPanel). */
function SessionDetailModal({ sessionId, churchId, serverUrl, onClose, onChanged, onEdit }: {
  sessionId: string; churchId: string; serverUrl: string; onClose: () => void; onChanged: () => void;
  onEdit: (session: any) => void;
}) {
  const { showToast } = useAppStore();
  const [sess, setSess] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, [sessionId]);

  async function handleDeleteSession() {
    if (!confirm("Delete this service and all its check-ins?\n\nThis cannot be undone.")) return;
    setDeleting(true);
    // Per-row deletes so each removal is written to the sync change log.
    for (const r of records) {
      await db.delete("attendance_record", r.id);
    }
    await db.delete("attendance_session", sessionId);
    showToast("Service deleted");
    setDeleting(false);
    onChanged();
    onClose();
  }

  async function load() {
    setLoading(true);
    const [srows, recs, people] = await Promise.all([
      db.rawQuery("SELECT * FROM attendance_session WHERE id = ?", [sessionId]),
      db.rawQuery(
        "SELECT ar.*, p.first_name, p.last_name, p.gender, p.photo_url FROM attendance_record ar LEFT JOIN person p ON ar.person_id = p.id WHERE ar.session_id = ? ORDER BY ar.date DESC",
        [sessionId]
      ),
      db.rawQuery(
        "SELECT id, first_name, last_name, gender, status, photo_url, date_of_birth, birthday FROM person WHERE church_id = ? ORDER BY first_name ASC, last_name ASC",
        [churchId]
      ),
    ]);
    setSess(srows[0] ?? null);
    setRecords(recs);
    const checkedIn = new Set(recs.map((r: any) => r.person_id).filter(Boolean));
    setCandidates(people.filter((p: any) => !checkedIn.has(p.id)));
    setLoading(false);
  }

  const checkInUrl = serverUrl ? `${serverUrl.replace(/\/$/, "")}/checkin/${sessionId}` : `/checkin/${sessionId}`;

  const filtered = q
    ? candidates.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  async function checkIn(c: any) {
    setPending(true);
    const category = categoryForPerson(c);
    await db.insert("attendance_record", {
      id: uuid(), church_id: churchId, branch_id: sess?.branch_id ?? null,
      person_id: c.id, session_id: sessionId, category,
      service_name: sess?.service_name ?? "Service",
      date: new Date().toISOString(), method: "manual",
    });
    // increment matching demographic counter on the session
    const field = CATEGORY_FIELD[category];
    await db.update("attendance_session", sessionId, { [field]: (sess?.[field] || 0) + 1 });
    showToast(`${c.first_name} ${c.last_name} checked in`);
    setQ("");
    setPending(false);
    await load();
    onChanged();
  }

  async function undo(r: any) {
    setPending(true);
    await db.delete("attendance_record", r.id);
    const category = r.category || "adult";
    const field = CATEGORY_FIELD[category] ?? "adults";
    await db.update("attendance_session", sessionId, { [field]: Math.max((sess?.[field] || 0) - 1, 0) });
    showToast(`${r.first_name ? `${r.first_name} ${r.last_name}` : r.guest_name || "Guest"} removed`);
    setPending(false);
    await load();
    onChanged();
  }

  const total = sess ? (sess.adults || 0) + (sess.teens || 0) + (sess.children || 0) + (sess.visitors || 0) : 0;
  const breakdown = sess ? [
    { name: "Adults", key: "adult", count: sess.adults || 0 },
    { name: "Teens", key: "teen", count: sess.teens || 0 },
    { name: "Children", key: "child", count: sess.children || 0 },
    { name: "Visitors", key: "visitor", count: sess.visitors || 0 },
  ] : [];

  return (
    <Modal open onClose={onClose} title={sess?.service_name || "Service attendance"} wide>
      {loading || !sess ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="-mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">{formatDate(sess.date)}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onEdit(sess)} className="btn-secondary btn-sm">
                <Pencil className="size-3.5" /> Edit
              </button>
              <button onClick={handleDeleteSession} disabled={deleting} className="btn-ghost btn-sm text-danger">
                {deleting ? <Loader2 className="size-3.5 whq-spin" /> : <Trash2 className="size-3.5" />}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          {/* Summary + breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card flex flex-col items-center justify-center p-4 text-center">
              <div className="text-3xl font-bold text-ink">{total}</div>
              <div className="text-[11px] text-ink-muted">total present</div>
            </div>
            {breakdown.map((b) => (
              <div key={b.key} className="card flex flex-col items-center justify-center p-4 text-center">
                <div className="text-2xl font-bold text-ink">{b.count}</div>
                <div className="text-[11px] text-ink-muted">{b.name}</div>
              </div>
            ))}
          </div>

          {/* Self check-in URL */}
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><QrCode className="size-4" /> Self check-in</div>
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-lg border border-line bg-white p-2">
                <QRCodeCanvas value={checkInUrl} size={96} bgColor="#ffffff" fgColor="#1c1a16" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <input readOnly value={checkInUrl} className="input h-9 flex-1 font-mono text-[11px]" />
                  <button
                    onClick={() => { navigator.clipboard?.writeText(checkInUrl); setCopied(true); showToast("Link copied"); setTimeout(() => setCopied(false), 1500); }}
                    className="btn-secondary btn-sm shrink-0"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">Members scan the QR or open the link to check themselves in. Requires online — self check-ins will sync.</p>
              </div>
            </div>
          </div>

          {/* Check-in members */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><UserCheck className="size-4" /> Check in members</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a name…" className="input h-9 pl-9 text-sm" />
              {filtered.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  {filtered.map((c) => (
                    <button key={c.id} onClick={() => checkIn(c)} disabled={pending}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50">
                      <Avatar name={`${c.first_name} ${c.last_name}`} src={c.photo_url} size="sm" />
                      <span className="flex-1 font-medium text-ink">{c.first_name} {c.last_name}</span>
                      {c.status === "visitor" && <span className="text-[11px] text-gold">visitor</span>}
                      <UserPlus className="size-4 text-primary-bright" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Present list */}
            <div className="mt-3">
              <h4 className="mb-2 text-xs font-semibold text-ink">Present <span className="text-ink-faint">({records.length})</span></h4>
              {records.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-ink-faint">
                  No-one checked in by name yet. Use the search above or the self check-in link.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {records.map((r) => {
                    const name = r.first_name ? `${r.first_name} ${r.last_name}` : r.guest_name || "Guest";
                    return (
                      <li key={r.id} className="flex items-center gap-2 rounded-xl border border-line bg-base px-3 py-2">
                        <Avatar name={name} src={r.photo_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">{name}</div>
                          <div className="text-[11px] text-ink-faint">
                            {CATEGORY_LABEL[r.category] ?? r.category}{r.method === "self" ? " · self check-in" : r.method === "qr" ? " · QR" : ""}
                          </div>
                        </div>
                        <button onClick={() => undo(r)} disabled={pending}
                          className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
                          {pending ? <Loader2 className="size-4 whq-spin" /> : <X className="size-4" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
