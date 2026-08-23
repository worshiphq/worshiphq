"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Plus, Trash2, Send, Copy, Check, Settings2, X, Loader2,
  Wallet, AlertTriangle, CheckCircle2, Phone, PhoneOff, Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  saveServiceSheet, deleteRoster, addServiceRole, deleteServiceRole,
  previewRosterNotify, notifyRoster,
  previewRosterAnnounce, announceRoster, saveRosterAnnounceSettings, saveRosterReminderSettings,
} from "@/app/actions/rosters";
import { SystemMessagesDialog } from "@/components/app/system-messages-dialog";
import { MessageSquare, Megaphone, Users, Clock, Bell } from "lucide-react";
import { WEEKDAY_OPTIONS } from "@/lib/automations/weekdays";
import { cn } from "@/lib/utils";

/** Shared "Days before / On a day" schedule picker used by the roster settings. */
function ScheduleControl({ verb, mode, setMode, leadDays, setLeadDays, weekday, setWeekday, hour, setHour }: {
  verb: string;
  mode: "relative" | "weekday"; setMode: (m: "relative" | "weekday") => void;
  leadDays: number; setLeadDays: (n: number) => void;
  weekday: number; setWeekday: (n: number) => void;
  hour: number; setHour: (n: number) => void;
}) {
  const sel = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm";
  return (
    <div className="space-y-2">
      <div className="flex w-fit gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
        {(["relative", "weekday"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn("rounded-md px-2.5 py-1 font-medium", mode === m ? "bg-primary text-white" : "text-ink-muted")}>
            {m === "relative" ? "Days before" : "On a day"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="size-4 text-primary" />
        <span className="text-sm">{verb}</span>
        {mode === "relative" ? (
          <select value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} className={sel}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d === 0 ? "same day" : `${d} day${d === 1 ? "" : "s"} before`}</option>)}
          </select>
        ) : (
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={sel}>
            {WEEKDAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}s</option>)}
          </select>
        )}
        <span className="text-sm">at</span>
        <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={sel}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
      </div>
    </div>
  );
}

type Group = { id: string; name: string; memberCount: number };
type Announce = { on: boolean; audience: string; groupId: string | null; leadDays: number; hour: number; weekday: number | null; timezone: string };
type Remind = { on: boolean; leadDays: number; hour: number; weekday: number | null };

function hourLabel(h: number) { const a = h < 12 ? "am" : "pm"; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:00 ${a}`; }

type Assignment = { id: string; role: string; personId: string | null; personName: string | null; hasPhone: boolean; notified: boolean };
type ServiceBlock = { service: string; date: string; time: string; assignments: Assignment[] };
type Sheet = { id: string; name: string; announceLeadDays: number | null; announceHour: number | null; announceWeekday: number | null; services: ServiceBlock[] };
type Member = { id: string; name: string; hasPhone: boolean };
type Role = { id: string; name: string };

const SERVICE_PRESETS = ["Sunday Service", "Wednesday Service", "Friday Service", "Prayer Meeting"];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtTime = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); if (!m) return ""; let h = +m[1]; const ap = h < 12 ? "am" : "pm"; h = h % 12 === 0 ? 12 : h % 12; return `${h}:${m[2]} ${ap}`; };

export function RostersClient({ sheets, members, roles, smsBalance, messageTemplates, groups, announce, remind, canWrite }: {
  sheets: Sheet[]; members: Member[]; roles: Role[]; smsBalance: number; messageTemplates: Record<string, string>;
  groups: Group[]; announce: Announce; remind: Remind; canWrite: boolean;
}) {
  const [editing, setEditing] = useState<Sheet | null>(null);
  const [creating, setCreating] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showAnnounce, setShowAnnounce] = useState(false);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{sheets.length} service sheet{sheets.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          {canWrite && <Button variant="secondary" size="sm" onClick={() => setShowAnnounce(true)}><Megaphone className="size-4" /> Announcement</Button>}
          {canWrite && <Button variant="secondary" size="sm" onClick={() => setShowMessages(true)}><MessageSquare className="size-4" /> Messages</Button>}
          <Button variant="secondary" size="sm" onClick={() => setShowRoles(true)}><Settings2 className="size-4" /> Manage roles</Button>
          {canWrite && <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New service sheet</Button>}
        </div>
      </div>

      {sheets.length === 0 ? (
        <Card className="p-12 text-center">
          <CalendarDays className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">No service sheets yet.</p>
          {canWrite && <p className="mt-1 text-xs text-ink-faint">Click “New service sheet” to set who serves this Sunday.</p>}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sheets.map((s) => (
            <SheetCard key={s.id} sheet={s} smsBalance={smsBalance} canWrite={canWrite} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <SheetDialog
          sheet={editing}
          members={members}
          roles={roles}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      {showRoles && <RolesManager roles={roles} canWrite={canWrite} onClose={() => setShowRoles(false)} />}
      {showMessages && <SystemMessagesDialog saved={messageTemplates} onClose={() => setShowMessages(false)} />}
      {showAnnounce && <AnnounceSettingsDialog announce={announce} remind={remind} groups={groups} onClose={() => setShowAnnounce(false)} />}
    </div>
  );
}

function SheetCard({ sheet, smsBalance, canWrite, onEdit }: { sheet: Sheet; smsBalance: number; canWrite: boolean; onEdit: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [notify, setNotify] = useState(false);
  const [announce, setAnnounce] = useState(false);

  const allAssignments = sheet.services.flatMap((s) => s.assignments);
  const withPhone = allAssignments.filter((a) => a.personId && a.hasPhone).length;
  const dateRange = sheet.services.length
    ? sheet.services.length === 1
      ? fmtDate(sheet.services[0].date)
      : `${fmtShort(sheet.services[0].date)} – ${fmtShort(sheet.services[sheet.services.length - 1].date)} · ${sheet.services.length} services`
    : "";

  const shareText = useMemo(() => {
    const blocks = sheet.services.map((s) => {
      const head = `${s.service.toUpperCase()} — ${fmtShort(s.date)}${s.time ? ` ${fmtTime(s.time)}` : ""}`;
      return [head, ...s.assignments.map((a) => `${a.role}: ${a.personName ?? "—"}`)].join("\n");
    });
    return blocks.join("\n\n").trim();
  }, [sheet]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast("Couldn't copy", "error"); }
  };

  const remove = () => {
    if (!confirm(`Delete the roster "${sheet.name}"?`)) return;
    const fd = new FormData(); fd.set("id", sheet.id);
    start(async () => { await deleteRoster(fd); toast("Roster deleted", "success"); router.refresh(); });
  };

  const overrideNote = sheet.announceLeadDays != null || sheet.announceHour != null
    ? `Own send time${sheet.announceHour != null ? ` · ${hourLabel(sheet.announceHour)}` : ""}${sheet.announceLeadDays != null ? ` · ${sheet.announceLeadDays === 0 ? "same day" : `${sheet.announceLeadDays}d before`}` : ""}`
    : null;

  return (
    <Card className="flex flex-col p-0">
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div>
          <h3 className="font-display text-lg font-semibold">{sheet.name}</h3>
          <p className="text-xs text-ink-muted">{dateRange}</p>
          {overrideNote && <p className="mt-0.5 text-[11px] text-primary-bright">{overrideNote}</p>}
        </div>
        {canWrite && (
          <button onClick={onEdit} title="Edit" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
            <Pencil className="size-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 p-4">
        {sheet.services.length === 0 ? (
          <p className="text-sm text-ink-faint">No services yet.</p>
        ) : sheet.services.map((svc, i) => (
          <div key={i}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {svc.service} · {fmtShort(svc.date)}{svc.time ? ` ${fmtTime(svc.time)}` : ""}
            </div>
            <div className="space-y-1">
              {svc.assignments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-32 text-ink-muted">{a.role}:</span>
                  <span className="flex-1 font-medium">{a.personName ?? "—"}</span>
                  {a.personId && (a.hasPhone
                    ? <Phone className={cn("size-3", a.notified ? "text-success" : "text-ink-faint")} />
                    : <PhoneOff className="size-3 text-ink-faint" />)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}
        </Button>
        {canWrite && (
          <Button size="sm" onClick={() => setNotify(true)} disabled={withPhone === 0}><Send className="size-4" /> Text everyone</Button>
        )}
        {canWrite && (
          <Button variant="secondary" size="sm" onClick={() => setAnnounce(true)}><Megaphone className="size-4" /> Announce</Button>
        )}
        <div className="flex-1" />
        {canWrite && (
          <button onClick={remove} disabled={pending} title="Delete roster" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {notify && <NotifyDialog sheetId={sheet.id} label={sheet.name} smsBalance={smsBalance} onClose={() => setNotify(false)} />}
      {announce && <AnnounceDialog sheetId={sheet.id} label={sheet.name} onClose={() => setAnnounce(false)} />}
    </Card>
  );
}

/** Manual "announce this sheet to the group" — cost preview then send. */
function AnnounceDialog({ sheetId, label, onClose }: { sheetId: string; label: string; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ recipients: number; cost: number; balance: number; remaining: number; enough: boolean; chars?: number; segments?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useMemo(() => { previewRosterAnnounce(sheetId).then((res) => { if (res.ok) setPreview(res); setLoading(false); }); }, [sheetId]);

  const send = async () => {
    setSending(true);
    const res = await announceRoster(sheetId);
    setSending(false);
    if (res.ok) { setResult({ ok: true, message: `Announced to ${res.sent} recipient${res.sent === 1 ? "" : "s"}.` }); router.refresh(); }
    else setResult({ ok: false, message: res.error });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={sending ? undefined : onClose}>
      <Card className="w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Announce to the group</h3>
            <p className="text-sm text-ink-muted">{label}</p>
          </div>
          <button onClick={onClose} disabled={sending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2 disabled:opacity-40"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Working out the cost…</div>
          ) : result ? (
            <div className={cn("flex items-start gap-2 rounded-xl border p-4 text-sm", result.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{result.message}</span>
            </div>
          ) : preview && preview.recipients > 0 ? (
            <div className="space-y-2.5 text-sm">
              <Row label="Recipients" value={`${preview.recipients}`} />
              {preview.chars != null && preview.segments != null && (
                <Row label="Message" value={`${preview.chars} chars · ${preview.segments} SMS each`} />
              )}
              <Row label="Current balance" value={`${preview.balance.toLocaleString()} credits`} icon={<Wallet className="size-3.5" />} />
              <Row label="This costs" value={`− ${preview.cost.toLocaleString()} credits`} strong />
              <div className="border-t border-line-soft" />
              <Row label="Balance after" value={`${preview.remaining.toLocaleString()} credits`} strong tone={preview.enough ? "ok" : "bad"} />
              {!preview.enough && <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Not enough credits.</div>}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> No recipients. Pick a group (with phone numbers) in Announcement settings.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          {result?.ok ? (
            <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button size="sm" onClick={send} disabled={sending || loading || !preview || !preview.enough || preview.recipients === 0}>
                {sending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Megaphone className="size-4" /> Announce now</>}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Auto-announcement schedule + recipient settings. */
function AnnounceSettingsDialog({ announce, remind, groups, onClose }: { announce: Announce; remind: Remind; groups: Group[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(announce.on);
  const [audience, setAudience] = useState(announce.audience);
  const [groupId, setGroupId] = useState(announce.groupId ?? "");
  const [leadDays, setLeadDays] = useState(announce.leadDays);
  const [hour, setHour] = useState(announce.hour);
  const [mode, setMode] = useState<"relative" | "weekday">(announce.weekday != null ? "weekday" : "relative");
  const [weekday, setWeekday] = useState(announce.weekday ?? 1);
  // Personal reminder settings
  const [remOn, setRemOn] = useState(remind.on);
  const [remLead, setRemLead] = useState(remind.leadDays);
  const [remHour, setRemHour] = useState(remind.hour);
  const [remMode, setRemMode] = useState<"relative" | "weekday">(remind.weekday != null ? "weekday" : "relative");
  const [remWeekday, setRemWeekday] = useState(remind.weekday ?? 1);

  const save = () => {
    const fd = new FormData();
    if (on) fd.set("on", "on");
    fd.set("audience", audience);
    fd.set("groupId", groupId);
    fd.set("leadDays", String(leadDays));
    fd.set("hour", String(hour));
    fd.set("weekday", mode === "weekday" ? String(weekday) : "");
    const rfd = new FormData();
    if (remOn) rfd.set("on", "on");
    rfd.set("leadDays", String(remLead));
    rfd.set("hour", String(remHour));
    rfd.set("weekday", remMode === "weekday" ? String(remWeekday) : "");
    start(async () => {
      const [a, r] = await Promise.all([saveRosterAnnounceSettings(fd), saveRosterReminderSettings(rfd)]);
      if (a?.ok && r?.ok) { toast("Roster message settings saved", "success"); router.refresh(); onClose(); }
      else toast(a?.error ?? r?.error ?? "Failed", "error");
    });
  };

  const sel = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <Card className="my-8 w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Roster messages</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"><Megaphone className="size-3.5" /> Group announcement</div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span className="text-sm font-medium">Automatically send the sheet ahead of each service</span>
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-primary" />
          </label>

          <div>
            <label className="mb-1 block text-xs text-ink-faint flex items-center gap-1.5"><Users className="size-3.5" /> Send to</label>
            <div className="flex items-center gap-2">
              <select value={audience} onChange={(e) => setAudience(e.target.value)} className={sel}>
                <option value="group">A group</option>
                <option value="church">The whole church</option>
              </select>
              {audience === "group" && (
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={cn(sel, "flex-1")}>
                  <option value="">— Pick a group —</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.memberCount})</option>)}
                </select>
              )}
            </div>
            {audience === "group" && groups.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">Create a group first (e.g. “Pulpit Workers”) on the Groups page, then add members.</p>
            )}
          </div>

          <ScheduleControl verb="Send" mode={mode} setMode={setMode} leadDays={leadDays} setLeadDays={setLeadDays} weekday={weekday} setWeekday={setWeekday} hour={hour} setHour={setHour} />
          <p className="text-xs text-ink-muted">Timezone: {announce.timezone} (set on the Birthdays page). You can also hit “Announce” on any sheet to send it now.</p>

          {/* Personal reminders */}
          <div className="border-t border-line pt-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"><Bell className="size-3.5" /> Personal reminders</div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <span className="text-sm font-medium">Text each rostered member their own duty before the service</span>
              <input type="checkbox" checked={remOn} onChange={(e) => setRemOn(e.target.checked)} className="size-4 accent-primary" />
            </label>
            <div className="mt-3">
              <ScheduleControl verb="Remind" mode={remMode} setMode={setRemMode} leadDays={remLead} setLeadDays={setRemLead} weekday={remWeekday} setWeekday={setRemWeekday} hour={remHour} setHour={setRemHour} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">On “Days before” it goes to the people serving that day; on “On a day” it lists everyone’s duties for the coming week. Edit the wording under “Messages”.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save</Button>
        </div>
      </Card>
    </div>
  );
}

type DialogRow = { role: string; personId: string; typed: string };
type DialogService = { service: string; date: string; time: string; rows: DialogRow[] };

function SheetDialog({ sheet, members, roles, onClose }: { sheet: Sheet | null; members: Member[]; roles: Role[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const makeRows = useMemo(() => (assignments: Assignment[]): DialogRow[] => {
    const byRole = new Map(assignments.map((a) => [a.role, a]));
    const names = [...roles.map((r) => r.name)];
    for (const a of assignments) if (!names.includes(a.role)) names.push(a.role);
    return names.map((role) => {
      const a = byRole.get(role);
      return { role, personId: a?.personId ?? "", typed: a?.personId ? "" : (a?.personName ?? "") };
    });
  }, [roles]);

  const [name, setName] = useState(sheet?.name ?? "");
  const [ovMode, setOvMode] = useState<"general" | "relative" | "weekday">(
    sheet?.announceWeekday != null ? "weekday" : (sheet?.announceLeadDays != null || sheet?.announceHour != null) ? "relative" : "general",
  );
  const [ovLead, setOvLead] = useState(sheet?.announceLeadDays ?? 2);
  const [ovHour, setOvHour] = useState(sheet?.announceHour ?? 8);
  const [ovWeekday, setOvWeekday] = useState(sheet?.announceWeekday ?? 1);
  const [services, setServices] = useState<DialogService[]>(
    sheet?.services?.length
      ? sheet.services.map((s) => ({ service: s.service, date: s.date.slice(0, 10), time: s.time, rows: makeRows(s.assignments) }))
      : [{ service: "Sunday Service", date: "", time: "", rows: makeRows([]) }],
  );

  const setSvc = (i: number, patch: Partial<DialogService>) => setServices((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const setRow = (si: number, ri: number, patch: Partial<DialogRow>) =>
    setServices((p) => p.map((s, idx) => (idx === si ? { ...s, rows: s.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) } : s)));
  const addService = () => setServices((p) => [...p, { service: "", date: "", time: "", rows: makeRows([]) }]);
  const removeService = (i: number) => setServices((p) => p.filter((_, idx) => idx !== i));

  const inputCls = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-primary/50";

  // Live message-size estimate (the exact credit cost is shown at Announce time).
  const nameOf = (r: DialogRow) => (r.personId ? memberName.get(r.personId) ?? "" : r.typed.trim());
  const bodyText = services
    .map((s) => {
      const head = `${s.service || "Service"} — ${s.date}${s.time ? ` ${s.time}` : ""}`;
      const lines = s.rows.filter((r) => r.personId || r.typed.trim()).map((r) => `${r.role}: ${nameOf(r) || "-"}`);
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
  const chars = bodyText.length;
  const segments = Math.max(1, Math.ceil(chars / 160));

  const submit = () => {
    const payload = services
      .map((s) => ({
        service: s.service.trim(),
        date: s.date,
        time: s.time,
        assignments: s.rows
          .filter((r) => r.personId || r.typed.trim())
          .map((r) => ({ role: r.role, personId: r.personId || null, personName: r.personId ? null : r.typed.trim() })),
      }))
      .filter((s) => s.service && s.date && s.assignments.length > 0);
    if (payload.length === 0) return toast("Add at least one service with a date and someone assigned", "error");

    const fd = new FormData();
    if (sheet) fd.set("sheetId", sheet.id);
    fd.set("name", name.trim());
    fd.set("services", JSON.stringify(payload));
    // Per-roster send-time override (empty = follow the general schedule).
    fd.set("announceLeadDays", ovMode === "relative" ? String(ovLead) : "");
    fd.set("announceHour", ovMode === "general" ? "" : String(ovHour));
    fd.set("announceWeekday", ovMode === "weekday" ? String(ovWeekday) : "");
    start(async () => {
      const res = await saveServiceSheet(fd);
      if (res?.ok) { toast(sheet ? "Roster updated" : "Roster created", "success"); router.refresh(); onClose(); }
      else toast(res?.error ?? "Failed", "error");
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface p-5">
          <h3 className="font-display text-lg font-semibold">{sheet ? "Edit roster" : "New roster"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>

        <datalist id="svc-presets">{SERVICE_PRESETS.map((s) => <option key={s} value={s} />)}</datalist>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs text-ink-faint">Roster name (shown as the message heading)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pulpit Workers — this week" className={cn(inputCls, "w-full")} />
          </div>

          {services.map((svc, si) => (
            <div key={si} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Service {services.length > 1 ? si + 1 : ""}</span>
                {services.length > 1 && (
                  <button onClick={() => removeService(si)} className="text-xs text-danger hover:underline">Remove</button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-xs text-ink-faint">Service</label>
                  <input list="svc-presets" value={svc.service} onChange={(e) => setSvc(si, { service: e.target.value })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-faint">Date</label>
                  <input type="date" value={svc.date} onChange={(e) => setSvc(si, { date: e.target.value })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-faint">Time</label>
                  <input type="time" value={svc.time} onChange={(e) => setSvc(si, { time: e.target.value })} className={cn(inputCls, "w-full")} />
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {svc.rows.map((r, ri) => (
                  <div key={r.role} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2">
                    <span className="min-w-0 break-words text-sm text-ink-muted">{r.role}</span>
                    <div className="flex min-w-0 items-center gap-1">
                      <select value={r.personId} onChange={(e) => setRow(si, ri, { personId: e.target.value, typed: e.target.value ? "" : r.typed })} className={cn(inputCls, "min-w-0 flex-1")}>
                        <option value="">— Member —</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.hasPhone ? "" : " (no phone)"}</option>)}
                      </select>
                      <input value={r.typed} onChange={(e) => setRow(si, ri, { typed: e.target.value, personId: e.target.value ? "" : r.personId })}
                        placeholder="or type" className={cn(inputCls, "w-20 shrink-0")} />
                    </div>
                  </div>
                ))}
                {svc.rows.length === 0 && <p className="text-xs text-ink-faint">No roles yet — add some via “Manage roles”.</p>}
              </div>
            </div>
          ))}

          <button onClick={addService} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-medium text-ink-muted hover:border-primary/40 hover:text-primary">
            <Plus className="size-4" /> Add another service
          </button>

          {/* Per-roster send time (falls back to the general Announcement settings) */}
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"><Clock className="size-3.5" /> Auto-announce time for this roster</div>
            <div className="flex w-fit flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
              {([["general", "Use general"], ["relative", "Days before"], ["weekday", "On a day"]] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setOvMode(m)}
                  className={cn("rounded-md px-2.5 py-1 font-medium", ovMode === m ? "bg-primary text-white" : "text-ink-muted")}>
                  {label}
                </button>
              ))}
            </div>
            {ovMode !== "general" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-muted">Send</span>
                {ovMode === "relative" ? (
                  <select value={ovLead} onChange={(e) => setOvLead(Number(e.target.value))} className={inputCls}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d === 0 ? "same day" : `${d} day${d === 1 ? "" : "s"} before`}</option>)}
                  </select>
                ) : (
                  <select value={ovWeekday} onChange={(e) => setOvWeekday(Number(e.target.value))} className={inputCls}>
                    {WEEKDAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}s</option>)}
                  </select>
                )}
                <span className="text-ink-muted">at</span>
                <select value={ovHour} onChange={(e) => setOvHour(Number(e.target.value))} className={inputCls}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-ink-faint">“Use general” follows the church-wide Announcement schedule. “On a day” sends every chosen weekday for services in the coming week.</p>
          </div>

          <p className="text-[11px] text-ink-faint">Message size: ≈ {chars} characters · {segments} SMS per recipient. Exact credits are shown when you tap Announce.</p>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {sheet ? "Save changes" : "Create roster"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function NotifyDialog({ sheetId, label, smsBalance, onClose }: { sheetId: string; label: string; smsBalance: number; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ recipients: number; cost: number; balance: number; remaining: number; enough: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useMemo(() => { previewRosterNotify(sheetId).then((res) => { if (res.ok) setPreview(res); setLoading(false); }); }, [sheetId]);

  const send = async () => {
    setSending(true);
    const res = await notifyRoster(sheetId);
    setSending(false);
    if (res.ok) { setResult({ ok: true, message: `Texted ${res.sent} person${res.sent === 1 ? "" : "s"}.` }); router.refresh(); }
    else setResult({ ok: false, message: res.error });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={sending ? undefined : onClose}>
      <Card className="w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Text everyone their duty</h3>
            <p className="text-sm text-ink-muted">{label}</p>
          </div>
          <button onClick={onClose} disabled={sending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2 disabled:opacity-40"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Working out the cost…</div>
          ) : result ? (
            <div className={cn("flex items-start gap-2 rounded-xl border p-4 text-sm", result.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{result.message}</span>
            </div>
          ) : preview && preview.recipients > 0 ? (
            <div className="space-y-2.5 text-sm">
              <Row label="People to text" value={`${preview.recipients}`} />
              <Row label="Current balance" value={`${preview.balance.toLocaleString()} credits`} icon={<Wallet className="size-3.5" />} />
              <Row label="This costs" value={`− ${preview.cost.toLocaleString()} credits`} strong />
              <div className="border-t border-line-soft" />
              <Row label="Balance after" value={`${preview.remaining.toLocaleString()} credits`} strong tone={preview.enough ? "ok" : "bad"} />
              {!preview.enough && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Not enough credits. Top up first.
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Nobody on this sheet has a phone number on file.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          {result?.ok ? (
            <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button size="sm" onClick={send} disabled={sending || loading || !preview || !preview.enough || preview.recipients === 0}>
                {sending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send now</>}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, tone, icon }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad"; icon?: React.ReactNode }) {
  const color = tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-ink-muted">{icon}{label}</span>
      <span className={cn(strong && "font-semibold", color)}>{value}</span>
    </div>
  );
}

function RolesManager({ roles, canWrite, onClose }: { roles: Role[]; canWrite: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  const add = () => {
    if (!name.trim()) return;
    const fd = new FormData(); fd.set("name", name.trim());
    start(async () => { await addServiceRole(fd); setName(""); toast("Role added", "success"); router.refresh(); });
  };
  const remove = (id: string, roleName: string) => {
    if (!confirm(`Remove the role "${roleName}"? Existing sheets keep their assignments.`)) return;
    const fd = new FormData(); fd.set("id", id);
    start(async () => { await deleteServiceRole(fd); toast("Role removed", "success"); router.refresh(); });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[85vh] w-full max-w-md overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Service roles</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-xs text-ink-muted">These are the duties that appear on every service sheet (Word Ministration, Prayer Leader, …).</p>
          <div className="space-y-1.5">
            {roles.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span>{r.name}</span>
                {canWrite && (
                  <button onClick={() => remove(r.id, r.name)} className="rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                )}
              </div>
            ))}
          </div>
          {canWrite && (
            <div className="mt-3 flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Add a role, e.g. Offertory" className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-primary/50" />
              <Button size="sm" onClick={add} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
