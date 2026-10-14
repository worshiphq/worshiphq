"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Search, Trash2, Heart, Users, Shield, BookOpen, AlertTriangle, CircleDot, CheckCircle2, Clock, Loader2,
  Plus, Pencil, MessageSquare, X, CalendarClock, Phone, Send, Bell,
} from "lucide-react";
import {
  deleteCounselingSession, updateCounselingStatus, saveCounselingSession, counselingTextDraft,
  sendCounselingTextNow, counselingMessages,
} from "@/app/actions/counseling";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { SearchSelect } from "@/components/app/search-select";
import { OtherSelect } from "@/components/app/other-select";
import { PERIODS, periodStart, filterSelectCls, Pager } from "@/components/app/list-filters";
import { formatDate } from "@/lib/utils";
import { ExtraAnswers, asExtra, type ExtraAnswer } from "@/components/app/extra-answers";
import { confirmBinDelete } from "@/lib/recycle-bin-events";
import { BIN_TOAST } from "@/lib/recycle-bin-config";

export interface CounselingRow {
  id: string;
  type: string;
  summary: string;
  notes: string | null;
  status: string;
  confidential: boolean;
  personId: string | null;
  memberName: string | null;
  counseleeName: string | null;
  phone: string | null;
  counseleePhone: string | null;
  counselorId: string | null;
  counselorName: string | null;
  date: string;
  dateYmd: string;
  followUpDate: string | null;
  followUpYmd: string;
  scheduledAt: string | null;
  scheduledYmd: string;
  scheduledHm: string;
  scheduledLabel: string | null;
  textUpdates: boolean;
  reminderSent: boolean;
  messageCount: number;
  extra: ExtraAnswer[] | null;
}

type Member = { id: string; name: string; phone: string | null };
type Counselor = { id: string; name: string };

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Heart }> = {
  general: { label: "General", icon: BookOpen },
  marriage: { label: "Marriage", icon: Heart },
  grief: { label: "Grief", icon: AlertTriangle },
  spiritual: { label: "Spiritual", icon: Shield },
  family: { label: "Family", icon: Users },
  addiction: { label: "Addiction", icon: AlertTriangle },
  other: { label: "Other", icon: CircleDot },
};
const TYPE_OPTIONS = ["general", "marriage", "grief", "spiritual", "family", "addiction", "other"].map((v) => ({ value: v, label: TYPE_CONFIG[v].label }));

const STATUS_STYLE: Record<string, { label: string; color: string; icon: typeof CircleDot }> = {
  open: { label: "Open", color: "text-brand bg-brand/10", icon: CircleDot },
  "follow-up": { label: "Follow-up", color: "text-gold bg-gold/10", icon: Clock },
  closed: { label: "Closed", color: "text-success bg-success/10", icon: CheckCircle2 },
};

const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

const Label = ({ children }: { children: React.ReactNode }) => <label className="mb-1.5 block text-sm font-medium text-ink-muted">{children}</label>;

const typeLabel = (t: string) => TYPE_CONFIG[t]?.label ?? t;

export function CounselingClient({
  sessions, members, counselors, canWrite, me,
}: { sessions: CounselingRow[]; members: Member[]; counselors: Counselor[]; canWrite: boolean; me: string }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("");
  const [period, setPeriod] = useState("");
  const [quick, setQuick] = useState<"" | "upcoming" | "overdue">("");
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<{ row: CounselingRow | null } | null>(null);
  const [textFor, setTextFor] = useState<CounselingRow | null>(null);
  const { toast } = useFeedback();
  const PAGE_SIZE = 12;

  const [now] = useState(() => Date.now());
  const isOverdue = (s: CounselingRow) => !!s.followUpDate && s.status !== "closed" && new Date(s.followUpDate).getTime() < now;
  const isUpcoming = (s: CounselingRow) => !!s.scheduledAt && s.status !== "closed" && new Date(s.scheduledAt).getTime() >= now;

  const types = [...new Set(sessions.map((s) => s.type))].sort();
  const since = periodStart(period);
  const text = q.trim().toLowerCase();

  const filtered = sessions
    .filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      if (counselorFilter && s.counselorId !== counselorFilter) return false;
      if (since !== null && new Date(s.date).getTime() < since) return false;
      if (quick === "upcoming" && !isUpcoming(s)) return false;
      if (quick === "overdue" && !isOverdue(s)) return false;
      if (!text) return true;
      return (
        s.summary.toLowerCase().includes(text) ||
        !!s.memberName?.toLowerCase().includes(text) ||
        !!s.counseleeName?.toLowerCase().includes(text) ||
        !!s.phone?.includes(text)
      );
    })
    .sort((a, b) =>
      quick === "upcoming" ? new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
        : new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtering = !!(q || statusFilter !== "all" || typeFilter || counselorFilter || period || quick);
  const cur = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const reset = (fn: () => void) => { fn(); setPage(1); };

  const overdue = sessions.filter(isOverdue).length;
  const upcoming = sessions.filter(isUpcoming).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder="Search name, phone or summary..." className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => reset(() => setStatusFilter(e.target.value))} className={filterSelectCls} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="follow-up">Follow-up</option>
          <option value="closed">Closed</option>
        </select>
        <select value={typeFilter} onChange={(e) => reset(() => setTypeFilter(e.target.value))} className={filterSelectCls} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        {counselors.length > 1 && (
          <select value={counselorFilter} onChange={(e) => reset(() => setCounselorFilter(e.target.value))} className={filterSelectCls} aria-label="Counselor">
            <option value="">All counselors</option>
            {counselors.map((c) => <option key={c.id} value={c.id}>{c.id === me ? `${c.name} (me)` : c.name}</option>)}
          </select>
        )}
        <select value={period} onChange={(e) => reset(() => setPeriod(e.target.value))} className={filterSelectCls} aria-label="Period">
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {canWrite && (
          <Button onClick={() => setForm({ row: null })}><Plus /> New session</Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total sessions", value: sessions.length, tone: "", on: "" as const },
          { label: "Open", value: sessions.filter((s) => s.status === "open").length, tone: "text-brand", on: "" as const },
          { label: "Upcoming appointments", value: upcoming, tone: "text-primary", on: "upcoming" as const },
          { label: "Follow-up overdue", value: overdue, tone: "text-danger", on: "overdue" as const },
        ].map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={!c.on}
            onClick={() => reset(() => setQuick(quick === c.on ? "" : c.on))}
            className={`rounded-xl border bg-surface p-3 text-center ${c.on && quick === c.on ? "border-primary" : "border-line"} ${c.on ? "hover:bg-surface-2" : "cursor-default"}`}
          >
            <div className={`text-2xl font-bold ${c.tone}`}>{c.value}</div>
            <div className="text-xs text-ink-muted">{c.label}</div>
          </button>
        ))}
      </div>

      {filtering && (
        <div className="mb-3 flex items-center justify-between text-xs text-ink-muted">
          <span>{filtered.length} session{filtered.length === 1 ? "" : "s"} match</span>
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setStatusFilter("all"); setTypeFilter(""); setCounselorFilter(""); setPeriod(""); setQuick(""); setPage(1); }}>Clear filters</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          {filtering ? "No sessions match those filters." : "No counseling sessions recorded. Use New session to log or book one."}
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((s) => {
            const typeCfg = TYPE_CONFIG[s.type] ?? { label: s.type, icon: CircleDot };
            const statusCfg = STATUS_STYLE[s.status] ?? STATUS_STYLE.open;
            const TypeIcon = typeCfg.icon;
            const StatusIcon = statusCfg.icon;
            const late = isOverdue(s);
            const who = s.memberName ?? s.counseleeName;
            return (
              <div key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypeIcon className="size-4 text-ink-muted" />
                    <span className="text-xs font-medium capitalize text-ink-muted">{typeCfg.label}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.color}`}>
                      <StatusIcon className="size-3" /> {statusCfg.label}
                    </span>
                    {s.confidential && <span title="Confidential"><Shield className="size-3.5 text-danger" /></span>}
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      <button onClick={() => setForm({ row: s })} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-brand/10 hover:text-brand" title="Edit session">
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => setTextFor(s)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-brand/10 hover:text-brand" title="Text this person">
                        <MessageSquare className="size-4" />
                      </button>
                      {s.status !== "closed" && (
                        <form action={(fd) => start(async () => { fd.set("id", s.id); fd.set("status", "closed"); await updateCounselingStatus(fd); toast("Session closed", "success"); })}>
                          <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-success/10 hover:text-success disabled:pointer-events-none" title="Close">
                            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                          </button>
                        </form>
                      )}
                      <form action={(fd) => { if (!confirmBinDelete("Delete this counselling session?")) return; start(async () => { fd.set("id", s.id); await deleteCounselingSession(fd); toast(BIN_TOAST, "success"); }); }}>
                        <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none" title="Delete">
                          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {who && <p className="mt-2 text-sm font-semibold">{who}{s.memberName ? "" : " (not a member)"}</p>}
                <p className={`${who ? "mt-0.5" : "mt-2"} text-sm ${who ? "text-ink-muted" : "font-medium"}`}>{s.summary}</p>
                <ExtraAnswers items={s.extra} className="mt-2" />

                {s.scheduledLabel && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    <CalendarClock className="size-3.5" /> {s.scheduledLabel}
                    {s.textUpdates && <span className="inline-flex items-center gap-1 font-normal text-primary/80"><Bell className="size-3" /> {s.reminderSent ? "reminded" : "will be reminded"}</span>}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
                  {s.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {s.phone}</span>}
                  {s.counselorName && <span>Counselor: {s.counselorName}</span>}
                  <span>{formatDate(s.date)}</span>
                  {s.messageCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /> {s.messageCount} text{s.messageCount === 1 ? "" : "s"} sent</span>}
                  {s.followUpDate && (
                    <span className={late ? "font-semibold text-danger" : ""}>
                      Follow-up: {formatDate(s.followUpDate)} {late ? "(overdue)" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <Pager page={cur} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
      )}

      {form && <SessionForm row={form.row} members={members} counselors={counselors} me={me} onClose={() => setForm(null)} />}
      {textFor && <TextDialog row={textFor} onClose={() => setTextFor(null)} />}
    </div>
  );
}

/* ───────── New / edit session ───────── */

function SessionForm({ row, members, counselors, me, onClose }: {
  row: CounselingRow | null; members: Member[]; counselors: Counselor[]; me: string; onClose: () => void;
}) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState(row?.type ?? "general");
  const [personId, setPersonId] = useState(row?.personId ?? "");
  const [name, setName] = useState(row?.counseleeName ?? "");
  const [phone, setPhone] = useState(row?.counseleePhone ?? "");
  const [counselorId, setCounselorId] = useState(row ? row.counselorId ?? "" : counselors.some((c) => c.id === me) ? me : "");
  const [date, setDate] = useState(row?.dateYmd ?? today);
  const [bookDate, setBookDate] = useState(row?.scheduledYmd ?? "");
  const [bookTime, setBookTime] = useState(row?.scheduledHm || "10:00");
  const [followUp, setFollowUp] = useState(row?.followUpYmd ?? "");
  const [summary, setSummary] = useState(row?.summary ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [status, setStatus] = useState(row?.status ?? "open");
  const [confidential, setConfidential] = useState(row?.confidential ?? true);
  const [textUpdates, setTextUpdates] = useState(row?.textUpdates ?? true);
  const [notify, setNotify] = useState(true);

  const member = members.find((m) => m.id === personId);
  // The phone box shows when you type a name, or when the chosen member has no number on file.
  const needsPhone = (!personId && name.trim().length > 0) || (!!member && !member.phone);
  const effectivePhone = member?.phone ?? phone.trim();
  const canText = !!bookDate && !!effectivePhone;

  function submit() {
    setError("");
    start(async () => {
      const res = await saveCounselingSession({
        id: row?.id, type, personId, counseleeName: name, counseleePhone: phone, counselorId, date,
        scheduledDate: bookDate, scheduledTime: bookTime, followUpDate: followUp, summary, notes, status,
        confidential, textUpdates: textUpdates && !!effectivePhone, notify: notify && canText,
      });
      if (!res.ok) return setError(res.error);
      toast(
        res.texted ? `Saved and texted ${res.texted}` : row ? "Session saved" : "Session logged",
        "success",
      );
      if (res.textError) toast(`Saved, but the text was not sent: ${res.textError}`, "error");
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !pending && onClose()}>
      <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto overscroll-contain p-0" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">{row ? "Edit session" : "New counselling session"}</h3>
            <p className="mt-0.5 text-sm text-ink-muted">Log a session, or book an appointment and text the person about it.</p>
          </div>
          <button onClick={onClose} disabled={pending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <OtherSelect name="type" options={TYPE_OPTIONS} defaultValue={type} className={field} onValueChange={setType} otherPlaceholder="What kind of counselling?" />
            </div>
            <div>
              <Label>Counselor</Label>
              <select value={counselorId} onChange={(e) => setCounselorId(e.target.value)} className={field}>
                <option value="">Not assigned</option>
                {counselors.map((c) => <option key={c.id} value={c.id}>{c.id === me ? `${c.name} (me)` : c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label>Who is it with?</Label>
            <SearchSelect
              value={personId}
              onChange={(v) => { setPersonId(v); if (v) { setName(""); } }}
              placeholder="Search for a member…"
              searchPlaceholder="Name, phone or member ID…"
              options={[
                { value: "", label: "Not a member (type a name below)" },
                ...members.map((m) => ({ value: m.id, label: m.name, hint: m.phone ?? "no phone" })),
              ]}
            />
            {!personId && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type their name, e.g. Kofi Mensah" className={`${field} mt-2`} />
            )}
          </div>

          {needsPhone && (
            <div>
              <Label>Phone number</Label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0241234567" inputMode="tel" className={field} />
              <p className="mt-1 text-[11px] text-ink-faint">{member ? `${member.name} has no number saved. This one is kept with the session.` : "Used to text them about their appointment."}</p>
            </div>
          )}
          {member?.phone && <p className="-mt-2 text-xs text-ink-muted">Will use {member.name}&apos;s number on file: {member.phone}</p>}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Session date</Label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
            <div>
              <Label>Appointment date</Label>
              <input type="date" value={bookDate} onChange={(e) => setBookDate(e.target.value)} className={field} />
            </div>
            <div>
              <Label>Appointment time</Label>
              <input type="time" value={bookTime} onChange={(e) => setBookTime(e.target.value)} disabled={!bookDate} className={field} />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={textUpdates && !!effectivePhone} onChange={(e) => setTextUpdates(e.target.checked)} disabled={!effectivePhone} className="mt-0.5 size-4 rounded border-line accent-primary" />
              <span>
                Text this person about the appointment
                <span className="mt-0.5 block text-xs text-ink-faint">
                  {effectivePhone
                    ? "They get a reminder the day before. The text only says when and with whom, never what it is about."
                    : "Add a phone number above to turn this on."}
                </span>
              </span>
            </label>
            {textUpdates && !!effectivePhone && canText && (
              <label className="mt-2.5 flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 size-4 rounded border-line accent-primary" />
                <span>
                  {row?.scheduledAt ? "Text them now that it has changed" : "Text them a confirmation now"}
                  <span className="mt-0.5 block text-xs text-ink-faint">Uses SMS credits. Untick to save quietly.</span>
                </span>
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Follow-up date</Label>
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={field} />
            </div>
            {row && (
              <div>
                <Label>Status</Label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                  <option value="open">Open</option>
                  <option value="follow-up">Follow-up</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <Label>Summary</Label>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Brief summary of the session" className={field} />
          </div>
          <div>
            <Label>Notes (confidential)</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7} placeholder="Detailed notes..." className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[1rem] leading-relaxed text-ink outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} className="size-4 rounded border-line accent-primary" />
            Mark as confidential
          </label>

          {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface p-4">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !summary.trim()}>
            {pending ? <><Loader2 className="animate-spin" /> {notify && canText ? "Saving and texting…" : "Saving…"}</> : row ? "Save changes" : "Save session"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ───────── Text the person ───────── */

type Kind = "reminder" | "update" | "custom";
const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "reminder", label: "Reminder", hint: "Remind them of the appointment" },
  { key: "update", label: "Update", hint: "Tell them it has changed" },
  { key: "custom", label: "Your own words", hint: "Write any message" },
];

function TextDialog({ row, onClose }: { row: CounselingRow; onClose: () => void }) {
  const { toast } = useFeedback();
  const [kind, setKind] = useState<Kind>(row.scheduledAt ? "reminder" : "custom");
  const [message, setMessage] = useState("");
  const [to, setTo] = useState<string | null>(row.phone);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ id: string; kind: string; body: string; sentTo: string; sentBy: string; createdAt: string }[] | null>(null);

  // Load the wording for the chosen kind.
  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const res = await counselingTextDraft(row.id, kind);
      if (!live) return;
      setLoading(false);
      if (res.ok) { setTo(res.to); setMessage(res.message); setError(""); } else setError(res.error);
    })();
    return () => { live = false; };
  }, [row.id, kind]);

  useEffect(() => {
    let live = true;
    counselingMessages(row.id).then((h) => { if (live) setHistory(h); });
    return () => { live = false; };
  }, [row.id]);

  async function send() {
    setSending(true);
    setError("");
    const res = await sendCounselingTextNow(row.id, kind, message);
    setSending(false);
    if (!res.ok) return setError(res.error);
    toast(`Text sent to ${res.to}`, "success");
    onClose();
  }

  const name = row.memberName ?? row.counseleeName ?? "this person";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !sending && onClose()}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Text {name}</h3>
            <p className="mt-0.5 text-sm text-ink-muted">{to ? `Goes to ${to}` : "No phone number on file"}</p>
          </div>
          <button onClick={onClose} disabled={sending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                disabled={sending || (k.key !== "custom" && !row.scheduledAt)}
                title={k.key !== "custom" && !row.scheduledAt ? "Book an appointment first" : k.hint}
                className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-40 ${kind === k.key ? "border-primary/40 bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2"}`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink-muted">
              <span>Message</span>
              <span className="text-xs font-normal text-ink-faint">{message.length} characters</span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={1000}
              disabled={sending || loading}
              placeholder={kind === "custom" ? "Write your message..." : ""}
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-[11px] text-ink-faint">Texts are not private. Leave out what the session is about.</p>
          </div>

          {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

          {history && history.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-muted">Already sent</div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-2 text-ink-faint">
                      <span className="font-medium capitalize text-ink-muted">{h.kind}</span>
                      <span>{new Date(h.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>by {h.sentBy}</span>
                    </div>
                    <p className="mt-0.5 text-ink-muted">{h.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || loading || !to || !message.trim()}>
            {sending ? <><Loader2 className="animate-spin" /> Sending…</> : <><Send /> Send text</>}
          </Button>
        </div>
      </Card>
    </div>
  );
}
