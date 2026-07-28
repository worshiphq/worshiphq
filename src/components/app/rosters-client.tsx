"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Plus, Trash2, Send, Copy, Check, ChevronDown, ChevronRight,
  Settings2, X, Loader2, Wallet, AlertTriangle, CheckCircle2, Phone, PhoneOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  addSlot, deleteSlot, deleteRoster, addServiceRole, deleteServiceRole,
  previewRosterNotify, notifyRoster,
} from "@/app/actions/rosters";
import { cn } from "@/lib/utils";

type Slot = {
  id: string; service: string | null; role: string; date: string;
  personId: string | null; personName: string | null; hasPhone: boolean; notified: boolean;
};
type Roster = { id: string; name: string; startDate: string; endDate: string; notes: string | null; slots: Slot[] };
type Member = { id: string; name: string; hasPhone: boolean };
type Role = { id: string; name: string };

const SERVICE_PRESETS = ["Sunday Service", "Wednesday Service", "Friday Service", "Prayer Meeting"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function RostersClient({
  rosters, members, roles, smsBalance, canWrite,
}: {
  rosters: Roster[];
  members: Member[];
  roles: Role[];
  smsBalance: number;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState<string | null>(rosters[0]?.id ?? null);
  const [showRoles, setShowRoles] = useState(false);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">{rosters.length} roster{rosters.length === 1 ? "" : "s"}</p>
        <Button variant="secondary" size="sm" onClick={() => setShowRoles(true)}>
          <Settings2 className="size-4" /> Manage roles
        </Button>
      </div>

      {rosters.length === 0 ? (
        <Card className="p-12 text-center">
          <CalendarDays className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">No rosters yet. Create one to plan who serves at each service.</p>
        </Card>
      ) : (
        rosters.map((r) => (
          <RosterCard
            key={r.id}
            roster={r}
            members={members}
            roles={roles}
            smsBalance={smsBalance}
            canWrite={canWrite}
            expanded={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
          />
        ))
      )}

      {showRoles && <RolesManager roles={roles} canWrite={canWrite} onClose={() => setShowRoles(false)} />}
    </div>
  );
}

function RosterCard({
  roster, members, roles, smsBalance, canWrite, expanded, onToggle,
}: {
  roster: Roster; members: Member[]; roles: Role[]; smsBalance: number;
  canWrite: boolean; expanded: boolean; onToggle: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [notify, setNotify] = useState(false);

  // Group slots by date → service → [slots].
  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<string, Slot[]>>();
    for (const s of roster.slots) {
      const dk = s.date.slice(0, 10);
      const svc = s.service ?? "Service";
      if (!byDate.has(dk)) byDate.set(dk, new Map());
      const svcMap = byDate.get(dk)!;
      if (!svcMap.has(svc)) svcMap.set(svc, []);
      svcMap.get(svc)!.push(s);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [roster.slots]);

  const assignedWithPhone = roster.slots.filter((s) => s.personId && s.hasPhone).length;

  const shareText = useMemo(() => {
    const lines: string[] = [`PULPIT WORKERS — ${roster.name}`, ""];
    for (const [dk, svcMap] of grouped) {
      for (const [svc, slots] of svcMap) {
        lines.push(`${svc.toUpperCase()} (${fmtShort(dk)}):`);
        for (const s of slots) lines.push(`${s.role}: ${s.personName ?? "—"}`);
        lines.push("");
      }
    }
    return lines.join("\n").trim();
  }, [grouped, roster.name]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { toast("Couldn't copy", "error"); }
  };

  const removeRoster = () => {
    if (!confirm(`Delete the roster "${roster.name}" and all its assignments? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set("id", roster.id);
    start(async () => { await deleteRoster(fd); toast("Roster deleted", "success"); router.refresh(); });
  };

  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-5 text-left">
        {expanded ? <ChevronDown className="size-5 text-ink-faint" /> : <ChevronRight className="size-5 text-ink-faint" />}
        <div className="flex-1">
          <h3 className="font-display text-lg font-semibold">{roster.name}</h3>
          <p className="text-xs text-ink-muted">
            {fmtShort(roster.startDate)} – {fmtShort(roster.endDate)} · {roster.slots.length} assignment{roster.slots.length === 1 ? "" : "s"}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line">
          {/* Pulpit-workers view */}
          <div className="space-y-5 p-5">
            {grouped.length === 0 ? (
              <p className="text-sm text-ink-faint">No assignments yet — add the first one below.</p>
            ) : (
              grouped.map(([dk, svcMap]) => (
                <div key={dk}>
                  <div className="mb-2 text-sm font-semibold text-ink">{fmtDate(dk)}</div>
                  <div className="space-y-3">
                    {[...svcMap.entries()].map(([svc, slots]) => (
                      <div key={svc} className="rounded-xl border border-line bg-surface-2/40 p-3">
                        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">{svc}</div>
                        <div className="space-y-1">
                          {slots.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 text-sm">
                              <span className="min-w-40 text-ink-muted">{s.role}:</span>
                              <span className="flex-1 font-medium">{s.personName ?? "—"}</span>
                              {s.personId && (s.hasPhone
                                ? <Phone className={cn("size-3", s.notified ? "text-success" : "text-ink-faint")} />
                                : <PhoneOff className="size-3 text-ink-faint" />)}
                              {canWrite && (
                                <button
                                  onClick={() => {
                                    if (!confirm(`Remove ${s.personName ?? "this assignment"} (${s.role})?`)) return;
                                    const fd = new FormData(); fd.set("id", s.id);
                                    start(async () => { await deleteSlot(fd); toast("Removed", "success"); router.refresh(); });
                                  }}
                                  className="rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-danger"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add assignment */}
          {canWrite && <AddAssignment rosterId={roster.id} members={members} roles={roles} />}

          {/* Footer actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
            <Button variant="secondary" size="sm" onClick={copy} disabled={roster.slots.length === 0}>
              {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy for sharing</>}
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setNotify(true)} disabled={assignedWithPhone === 0}>
                <Send className="size-4" /> Text everyone
              </Button>
            )}
            <div className="flex-1" />
            {canWrite && (
              <Button variant="ghost" size="sm" onClick={removeRoster} disabled={pending}
                className="text-danger hover:bg-danger/10">
                <Trash2 className="size-4" /> Delete roster
              </Button>
            )}
          </div>
        </div>
      )}

      {notify && <NotifyDialog roster={roster} smsBalance={smsBalance} onClose={() => setNotify(false)} />}
    </Card>
  );
}

function AddAssignment({ rosterId, members, roles }: { rosterId: string; members: Member[]; roles: Role[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [service, setService] = useState("Sunday Service");
  const [roleName, setRoleName] = useState(roles[0]?.name ?? "");
  const [personId, setPersonId] = useState("");
  const [typedName, setTypedName] = useState("");

  const submit = () => {
    if (!date) return toast("Pick a date", "error");
    if (!roleName) return toast("Pick a role", "error");
    if (!personId && !typedName.trim()) return toast("Choose a member or type a name", "error");
    const fd = new FormData();
    fd.set("rosterId", rosterId);
    fd.set("date", date);
    fd.set("service", service);
    fd.set("role", roleName);
    if (personId) fd.set("personId", personId);
    else fd.set("personName", typedName.trim());
    start(async () => {
      await addSlot(fd);
      toast("Assignment added", "success");
      setPersonId(""); setTypedName("");
      router.refresh();
    });
  };

  const inputCls = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-primary/50";

  return (
    <div className="border-t border-line bg-surface-2/30 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Add assignment</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        <input list="svc-presets" value={service} onChange={(e) => setService(e.target.value)} placeholder="Service" className={inputCls} />
        <datalist id="svc-presets">{SERVICE_PRESETS.map((s) => <option key={s} value={s} />)}</datalist>
        <select value={roleName} onChange={(e) => setRoleName(e.target.value)} className={inputCls}>
          {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
        <select value={personId} onChange={(e) => { setPersonId(e.target.value); if (e.target.value) setTypedName(""); }} className={inputCls}>
          <option value="">— Member —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.hasPhone ? "" : " (no phone)"}</option>)}
        </select>
        <input value={typedName} onChange={(e) => { setTypedName(e.target.value); if (e.target.value) setPersonId(""); }}
          placeholder="…or type a name" className={inputCls} />
      </div>
      <div className="mt-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </Button>
      </div>
    </div>
  );
}

function NotifyDialog({ roster, smsBalance, onClose }: { roster: Roster; smsBalance: number; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ recipients: number; cost: number; balance: number; remaining: number; enough: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useMemo(() => {
    previewRosterNotify(roster.id).then((res) => {
      if (res.ok) setPreview(res);
      setLoading(false);
    });
  }, [roster.id]);

  const send = async () => {
    setSending(true);
    const res = await notifyRoster(roster.id);
    setSending(false);
    if (res.ok) { setResult({ ok: true, message: `Texted ${res.sent} member${res.sent === 1 ? "" : "s"} their duties.` }); router.refresh(); }
    else setResult({ ok: false, message: res.error });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={sending ? undefined : onClose}>
      <Card className="w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Text everyone their duties</h3>
            <p className="text-sm text-ink-muted">Each member gets their own roles & dates.</p>
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
              <Row label="Members to text" value={`${preview.recipients}`} />
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
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> No assigned members have a phone number on file.
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
    if (!confirm(`Remove the role "${roleName}"? Existing assignments keep their role text.`)) return;
    const fd = new FormData(); fd.set("id", id);
    start(async () => { await deleteServiceRole(fd); toast("Role removed", "success"); router.refresh(); });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Service roles</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <div className="space-y-1.5">
            {roles.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span>{r.name}</span>
                {canWrite && (
                  <button onClick={() => remove(r.id, r.name)} className="rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canWrite && (
            <div className="mt-3 flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Add a role, e.g. Offertory" className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-primary/50" />
              <Button size="sm" onClick={add} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
