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
} from "@/app/actions/rosters";
import { SystemMessagesDialog } from "@/components/app/system-messages-dialog";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = { id: string; role: string; personId: string | null; personName: string | null; hasPhone: boolean; notified: boolean };
type Sheet = { id: string; service: string; date: string; assignments: Assignment[] };
type Member = { id: string; name: string; hasPhone: boolean };
type Role = { id: string; name: string };

const SERVICE_PRESETS = ["Sunday Service", "Wednesday Service", "Friday Service", "Prayer Meeting"];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function RostersClient({ sheets, members, roles, smsBalance, messageTemplates, canWrite }: {
  sheets: Sheet[]; members: Member[]; roles: Role[]; smsBalance: number; messageTemplates: Record<string, string>; canWrite: boolean;
}) {
  const [editing, setEditing] = useState<Sheet | null>(null);
  const [creating, setCreating] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{sheets.length} service sheet{sheets.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
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
    </div>
  );
}

function SheetCard({ sheet, smsBalance, canWrite, onEdit }: { sheet: Sheet; smsBalance: number; canWrite: boolean; onEdit: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [notify, setNotify] = useState(false);

  const withPhone = sheet.assignments.filter((a) => a.personId && a.hasPhone).length;

  const shareText = useMemo(() => {
    const lines = [`${sheet.service.toUpperCase()} — ${fmtShort(sheet.date)}`, ""];
    for (const a of sheet.assignments) lines.push(`${a.role}: ${a.personName ?? "—"}`);
    return lines.join("\n").trim();
  }, [sheet]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast("Couldn't copy", "error"); }
  };

  const remove = () => {
    if (!confirm(`Delete the ${sheet.service} sheet for ${fmtShort(sheet.date)}?`)) return;
    const fd = new FormData(); fd.set("id", sheet.id);
    start(async () => { await deleteRoster(fd); toast("Sheet deleted", "success"); router.refresh(); });
  };

  return (
    <Card className="flex flex-col p-0">
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div>
          <h3 className="font-display text-lg font-semibold">{sheet.service}</h3>
          <p className="text-xs text-ink-muted">{fmtDate(sheet.date)}</p>
        </div>
        {canWrite && (
          <button onClick={onEdit} title="Edit" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
            <Pencil className="size-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1 p-4">
        {sheet.assignments.length === 0 ? (
          <p className="text-sm text-ink-faint">No roles filled.</p>
        ) : sheet.assignments.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-40 text-ink-muted">{a.role}:</span>
            <span className="flex-1 font-medium">{a.personName ?? "—"}</span>
            {a.personId && (a.hasPhone
              ? <Phone className={cn("size-3", a.notified ? "text-success" : "text-ink-faint")} />
              : <PhoneOff className="size-3 text-ink-faint" />)}
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
        <div className="flex-1" />
        {canWrite && (
          <button onClick={remove} disabled={pending} title="Delete sheet" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {notify && <NotifyDialog sheetId={sheet.id} label={`${sheet.service} · ${fmtShort(sheet.date)}`} smsBalance={smsBalance} onClose={() => setNotify(false)} />}
    </Card>
  );
}

function SheetDialog({ sheet, members, roles, onClose }: { sheet: Sheet | null; members: Member[]; roles: Role[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(sheet ? sheet.date.slice(0, 10) : "");
  const [service, setService] = useState(sheet?.service ?? "Sunday Service");

  // One editable line per role. Prefill from the sheet's assignments by role.
  const initial = useMemo(() => {
    const byRole = new Map(sheet?.assignments.map((a) => [a.role, a]) ?? []);
    // Include every church role, plus any extra roles already on the sheet.
    const names = [...roles.map((r) => r.name)];
    for (const a of sheet?.assignments ?? []) if (!names.includes(a.role)) names.push(a.role);
    return names.map((role) => {
      const a = byRole.get(role);
      return { role, personId: a?.personId ?? "", typed: a?.personId ? "" : (a?.personName ?? "") };
    });
  }, [sheet, roles]);
  const [rows, setRows] = useState(initial);

  const setRow = (i: number, patch: Partial<{ personId: string; typed: string }>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const inputCls = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-primary/50";

  const submit = () => {
    if (!date) return toast("Pick a date", "error");
    if (!service.trim()) return toast("Enter a service", "error");
    const assignments = rows
      .filter((r) => r.personId || r.typed.trim())
      .map((r) => ({ role: r.role, personId: r.personId || null, personName: r.personId ? null : r.typed.trim() }));
    if (assignments.length === 0) return toast("Assign at least one person", "error");
    const fd = new FormData();
    if (sheet) fd.set("sheetId", sheet.id);
    fd.set("date", date); fd.set("service", service.trim());
    fd.set("assignments", JSON.stringify(assignments));
    start(async () => {
      const res = await saveServiceSheet(fd);
      if (res?.ok) { toast(sheet ? "Sheet updated" : "Sheet created", "success"); router.refresh(); onClose(); }
      else toast(res?.error ?? "Failed", "error");
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[88vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface p-5">
          <h3 className="font-display text-lg font-semibold">{sheet ? "Edit service sheet" : "New service sheet"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, "w-full")} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Service</label>
              <input list="svc-presets" value={service} onChange={(e) => setService(e.target.value)} className={cn(inputCls, "w-full")} />
              <datalist id="svc-presets">{SERVICE_PRESETS.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Who serves</div>
            {rows.map((r, i) => (
              <div key={r.role} className="grid grid-cols-[1fr_1.4fr] items-center gap-2">
                <span className="text-sm text-ink-muted">{r.role}</span>
                <div className="flex items-center gap-1">
                  <select value={r.personId} onChange={(e) => setRow(i, { personId: e.target.value, typed: e.target.value ? "" : r.typed })} className={cn(inputCls, "min-w-0 flex-1")}>
                    <option value="">— Member —</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.hasPhone ? "" : " (no phone)"}</option>)}
                  </select>
                  <input value={r.typed} onChange={(e) => setRow(i, { typed: e.target.value, personId: e.target.value ? "" : r.personId })}
                    placeholder="or type" className={cn(inputCls, "w-24")} />
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="text-xs text-ink-faint">No roles yet — add some via “Manage roles”.</p>}
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {sheet ? "Save changes" : "Create sheet"}
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
