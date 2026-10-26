"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare, Phone, MessageCircle, History, Search, Send, Loader2, CheckCircle2, X, AlertTriangle, Sparkles, Eye, Pencil } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-shell";
import { useFeedback } from "@/components/ui/feedback";
import {
  sendChurchEmail, sendChurchSms, getOutreachHistory, saveAlertPhone, sendAlertTest,
  type OutreachData, type OutreachChurch, type OutreachContact, type OutreachHistoryRow,
} from "@/app/actions/admin-outreach";
import { OUTREACH_TEMPLATES, firstName, mergeFields, renderEmailHtml, templateById, type OutreachChannel } from "@/lib/outreach/templates";
import { cn } from "@/lib/utils";

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const primary = `${btn} bg-teal-500 text-slate-950 hover:bg-teal-400`;
const ghost = `${btn} border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`;
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none";

/** A Ghana number as digits with the country code, for tel: and WhatsApp links. */
const intl = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `233${d.slice(1)}` : d;
};
const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d < 60 ? `${d} d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Composer = { mode: OutreachChannel; churches: OutreachChurch[]; template?: string } | null;

export function OutreachClient({ data }: { data: OutreachData }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "free" | "paid">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<Composer>(null);
  const [history, setHistory] = useState<OutreachChurch | null>(null);

  const needWelcome = useMemo(() => data.churches.filter((c) => !c.welcomedAt && c.contacts.some((x) => x.email)), [data.churches]);
  const rows = useMemo(() => data.churches.filter((c) => {
    if (filter === "new" && c.welcomedAt) return false;
    if (filter === "free" && c.plan !== "free") return false;
    if (filter === "paid" && c.plan === "free") return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return c.name.toLowerCase().includes(t) || (c.city ?? "").toLowerCase().includes(t) || c.contacts.some((x) => `${x.name} ${x.email} ${x.phone ?? ""}`.toLowerCase().includes(t));
  }), [data.churches, q, filter]);
  const chosen = data.churches.filter((c) => sel.has(c.id));
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Outreach</h1>
        <p className="mt-1 text-sm text-slate-400">Reach the owner and admins of every church by email, SMS, call or WhatsApp. New churches get a welcome email automatically.</p>
      </div>

      {/* Are messages really going out? */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Status ok={data.emailLive} title="Email" good="Connected. Emails are delivered." bad="Not connected. The same email settings that send your other emails (EMAIL_PROVIDER and its keys) are not set where this is running, so messages are only logged." />
        <Status ok={data.smsLive} title="SMS" good="Connected. Texts are delivered." bad="Not connected. Texts are only logged, not delivered." />
        <AdminCard className="p-4 text-sm">
          <div className="font-semibold text-slate-200">Replies go to</div>
          <div className="mt-1 break-all text-slate-300">{data.contact}</div>
          <div className="mt-1 text-xs text-slate-500">Set by SUPERADMIN_EMAIL in Vercel.</div>
        </AdminCard>
      </div>

      <AlertCard alert={data.alert} smsLive={data.smsLive} />

      {/* Welcome */}
      <AdminCard className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Sparkles className="size-4 text-teal-400" /> Welcome email</div>
            <p className="mt-1 text-sm text-slate-400">
              Sent automatically to every new church owner when they sign up.{" "}
              {needWelcome.length > 0
                ? <><b className="text-amber-300">{needWelcome.length}</b> of {data.churches.length} churches on the platform have not had it yet.</>
                : "Every church on the platform has had it."}
            </p>
          </div>
          <button className={primary} disabled={needWelcome.length === 0} onClick={() => setComposer({ mode: "email", churches: needWelcome, template: "welcome" })}>
            <Send className="size-4" /> Send welcome to {needWelcome.length} church{needWelcome.length === 1 ? "" : "es"}
          </button>
        </div>
      </AdminCard>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input className={`${input} w-64 pl-9`} placeholder="Search church, name, email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {([["all", "All"], ["new", "Not welcomed"], ["free", "Free plan"], ["paid", "Paid plans"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1 text-xs", filter === k ? "border-teal-500/60 bg-teal-500/15 text-teal-300" : "border-white/10 text-slate-400 hover:bg-white/5")}>{label}</button>
        ))}
        <span className="ml-auto text-xs text-slate-500">{rows.length} shown</span>
      </div>

      {chosen.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-sm">
          <b className="text-teal-300">{chosen.length} selected</b>
          <button className={ghost} onClick={() => setComposer({ mode: "email", churches: chosen })}><Mail className="size-4" /> Email them</button>
          <button className={ghost} onClick={() => setComposer({ mode: "sms", churches: chosen })}><MessageSquare className="size-4" /> Text them</button>
          <button className="ml-auto text-xs text-slate-400 hover:text-white" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-10 px-4 py-3"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 accent-teal-500" /></th>
                <th className="px-2 py-3">Church</th><th className="px-2 py-3">Owner</th><th className="px-2 py-3">Status</th><th className="px-2 py-3 text-right">Reach out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((c) => {
                const o = c.contacts[0];
                return (
                  <tr key={c.id} className="align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 size-4 accent-teal-500" /></td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-100">{c.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="rounded bg-white/5 px-1.5 py-0.5 capitalize text-slate-300">{c.plan}</span>
                        <span>Joined {day(c.createdAt)}</span>
                        {c.suspended && <span className="text-red-400">Suspended</span>}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {o ? (
                        <>
                          <div className="text-slate-200">{o.name}</div>
                          <div className="break-all text-xs text-slate-400">{o.email}</div>
                          <div className="text-xs text-slate-400">{o.phone || <span className="text-slate-600">no phone</span>}</div>
                          {c.contacts.length > 1 && <div className="mt-0.5 text-[11px] text-slate-500">+{c.contacts.length - 1} admin{c.contacts.length > 2 ? "s" : ""}</div>}
                        </>
                      ) : <span className="text-xs text-slate-600">No owner or admin</span>}
                    </td>
                    <td className="px-2 py-3 text-xs">
                      {c.welcomedAt
                        ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="size-3.5" /> Welcomed {day(c.welcomedAt)}</span>
                        : <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="size-3.5" /> Not welcomed</span>}
                      <div className="mt-1 text-slate-500">{c.lastContactAt ? `Last contacted ${ago(c.lastContactAt)}` : "Never contacted"}{c.messages > 0 ? ` · ${c.messages} message${c.messages === 1 ? "" : "s"}` : ""}</div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button title="Email" className={ghost} disabled={!c.contacts.some((x) => x.email)} onClick={() => setComposer({ mode: "email", churches: [c] })}><Mail className="size-4" /></button>
                        <button title="Text message" className={ghost} disabled={!c.contacts.some((x) => x.phone)} onClick={() => setComposer({ mode: "sms", churches: [c] })}><MessageSquare className="size-4" /></button>
                        {o?.phone ? (
                          <>
                            <a title={`Call ${o.phone}`} className={ghost} href={`tel:+${intl(o.phone)}`}><Phone className="size-4" /></a>
                            <a title="WhatsApp" className={ghost} target="_blank" rel="noopener noreferrer" href={`https://wa.me/${intl(o.phone)}`}><MessageCircle className="size-4" /></a>
                          </>
                        ) : null}
                        <button title="Message history" className={ghost} onClick={() => setHistory(c)}><History className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No churches match.</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {composer && (
        <Compose key={`${composer.mode}-${composer.template ?? ""}-${composer.churches.map((c) => c.id).join()}`} data={data} composer={composer}
          onClose={() => setComposer(null)} onDone={() => { setSel(new Set()); router.refresh(); }} />
      )}
      {history && <HistoryDialog church={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Status({ ok, title, good, bad }: { ok: boolean; title: string; good: string; bad: string }) {
  return (
    <AdminCard className={cn("p-4 text-sm", !ok && "border-amber-500/30 bg-amber-500/5")}>
      <div className="flex items-center gap-2 font-semibold text-slate-200">
        <span className={cn("size-2 rounded-full", ok ? "bg-emerald-400" : "bg-amber-400")} /> {title}
      </div>
      <div className={cn("mt-1 text-xs", ok ? "text-slate-400" : "text-amber-200")}>{ok ? good : bad}</div>
    </AdminCard>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** The contact we reach for a church: the chosen one, else the first who has an email or phone. */
function pickContact(c: OutreachChurch, mode: OutreachChannel, chosenId?: string): OutreachContact | null {
  const ok = (x: OutreachContact) => (mode === "email" ? !!x.email : !!x.phone);
  return c.contacts.find((x) => x.userId === chosenId && ok(x)) ?? c.contacts.find(ok) ?? null;
}

function Compose({ data, composer, onClose, onDone }: { data: OutreachData; composer: NonNullable<Composer>; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const { mode, churches } = composer;
  const bulk = churches.length > 1;
  const templates = OUTREACH_TEMPLATES.filter((t) => t.channel === mode);
  const start = templateById(composer.template ?? "") ?? templates[0];
  const [tplId, setTplId] = useState(start.id);
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; fails: { church: string; error: string }[] } | null>(null);

  const live = mode === "email" ? data.emailLive : data.smsLive;
  const targets = churches.map((c) => ({ church: c, contact: pickContact(c, mode, bulk ? undefined : contactId) })).filter((t): t is { church: OutreachChurch; contact: OutreachContact } => !!t.contact);
  const skipped = churches.length - targets.length;
  const sample = targets[0];
  const merge = sample ? { name: firstName(sample.contact.name), church: sample.church.name, contact: data.contact } : { name: "Ama", church: "Your church", contact: data.contact };
  const previewHtml = mode === "email" ? renderEmailHtml({ subject: mergeFields(subject, merge), body: mergeFields(body, merge), church: merge.church, contact: data.contact }) : "";
  const smsText = mergeFields(body, merge);
  const smsParts = Math.max(1, Math.ceil(smsText.length / 160));

  function pick(id: string) {
    const t = templateById(id);
    if (!t) return;
    setTplId(id); setSubject(t.subject); setBody(t.body);
  }

  async function send() {
    if (!live) return;
    if (bulk && !window.confirm(`Send this ${mode === "email" ? "email" : "text"} to ${targets.length} church${targets.length === 1 ? "" : "es"}? This cannot be undone.`)) return;
    setSending(true);
    const fails: { church: string; error: string }[] = [];
    setProgress({ done: 0, total: targets.length, fails });
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const r = mode === "email"
          ? await sendChurchEmail({ churchId: t.church.id, userId: t.contact.userId, template: tplId, subject, body })
          : await sendChurchSms({ churchId: t.church.id, userId: t.contact.userId, template: tplId, body });
        if (!r.ok) fails.push({ church: t.church.name, error: r.error ?? "Failed" });
      } catch (e) {
        fails.push({ church: t.church.name, error: (e as Error).message || "Failed" });
      }
      setProgress({ done: i + 1, total: targets.length, fails: [...fails] });
      if (mode === "email" && i < targets.length - 1) await sleep(700); // stay inside the email provider's rate limit
    }
    setSending(false);
    onDone();
    if (fails.length === 0) { toast(`Sent to ${targets.length} church${targets.length === 1 ? "" : "es"}.`, "success"); onClose(); }
    else toast(`${targets.length - fails.length} sent, ${fails.length} failed. See the list.`, "error");
  }

  const finished = !!progress && !sending && progress.done === progress.total;

  return (
    <Modal title={mode === "email" ? (bulk ? `Email ${churches.length} churches` : `Email ${churches[0].name}`) : (bulk ? `Text ${churches.length} churches` : `Text ${churches[0].name}`)} onClose={sending ? () => {} : onClose} wide>
      <div className="space-y-4">
        {!live && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {mode === "email" ? "Email is not connected here, so nothing can be delivered yet. Check the email settings (EMAIL_PROVIDER and its keys) in Vercel." : "SMS is not connected, so nothing can be delivered yet."}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">Template
            <select className={`${input} mt-1`} value={tplId} onChange={(e) => pick(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.label}</option>)}
            </select>
            <span className="mt-1 block text-slate-500">{templateById(tplId)?.hint}</span>
          </label>
          <div className="text-xs text-slate-400">To
            {bulk ? (
              <div className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">Each church&apos;s owner ({targets.length}){skipped > 0 ? `, ${skipped} skipped (no ${mode === "email" ? "email" : "phone"})` : ""}</div>
            ) : (
              <select className={`${input} mt-1`} value={contactId ?? targets[0]?.contact.userId ?? ""} onChange={(e) => setContactId(e.target.value)}>
                {churches[0].contacts.filter((x) => (mode === "email" ? x.email : x.phone)).map((x) => <option key={x.userId} value={x.userId} className="bg-slate-900">{x.name} ({x.role}) - {mode === "email" ? x.email : x.phone}</option>)}
              </select>
            )}
          </div>
        </div>

        {mode === "email" && (
          <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm">
            {([["edit", "Write", Pencil], ["preview", "Preview", Eye]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setView(k)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5", view === k ? "bg-white/10 text-white" : "text-slate-400")}><Icon className="size-4" /> {label}</button>
            ))}
          </div>
        )}

        {mode === "email" && view === "preview" ? (
          <iframe title="Email preview" srcDoc={previewHtml} className="h-[26rem] w-full rounded-lg border border-white/10 bg-white" />
        ) : (
          <>
            {mode === "email" && <label className="block text-xs text-slate-400">Subject<input className={`${input} mt-1`} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}
            <label className="block text-xs text-slate-400">Message
              <textarea className={`${input} mt-1 font-sans leading-relaxed`} rows={mode === "email" ? 13 : 5} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>Use <code className="text-slate-300">{"{{name}}"}</code>, <code className="text-slate-300">{"{{church}}"}</code> and <code className="text-slate-300">{"{{contact}}"}</code>. They are filled in for each person.</span>
              {mode === "sms" && <span>{smsText.length} characters, {smsParts} text{smsParts === 1 ? "" : "s"} each</span>}
            </div>
          </>
        )}

        {progress && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
            <div className="flex items-center gap-2 text-slate-200">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-emerald-400" />}
              {sending ? "Sending" : "Finished"}: {progress.done} of {progress.total}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-teal-500 transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
            {progress.fails.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-red-300">{progress.fails.map((f, i) => <li key={i}>{f.church}: {f.error}</li>)}</ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button className={ghost} onClick={onClose} disabled={sending}>{finished ? "Close" : "Cancel"}</button>
          {!finished && (
            <button className={primary} disabled={sending || !live || targets.length === 0 || !body.trim() || (mode === "email" && !subject.trim())} onClick={send}>
              {sending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send{bulk ? ` to ${targets.length}` : ""}</>}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function HistoryDialog({ church, onClose }: { church: OutreachChurch; onClose: () => void }) {
  const [rows, setRows] = useState<OutreachHistoryRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Load once when the dialog opens.
  useEffect(() => {
    let live = true;
    getOutreachHistory(church.id).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [church.id]);
  const tone: Record<string, string> = { sent: "text-emerald-400", stubbed: "text-amber-300", failed: "text-red-400" };
  const label: Record<string, string> = { sent: "Delivered", stubbed: "Not delivered (email not connected)", failed: "Failed" };
  return (
    <Modal title={`History: ${church.name}`} onClose={onClose} wide>
      {failed ? <p className="text-sm text-red-300">Could not load the history.</p>
        : rows === null ? <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        : rows.length === 0 ? <p className="text-sm text-slate-400">Nothing has been sent to this church yet.</p>
        : (
          <ul className="divide-y divide-white/5">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {r.channel === "email" ? <Mail className="mt-0.5 size-4 shrink-0 text-slate-400" /> : <MessageSquare className="mt-0.5 size-4 shrink-0 text-slate-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-100">{r.subject || r.body.slice(0, 70)}</div>
                    <div className="text-xs text-slate-500">{r.toName ? `${r.toName} · ` : ""}{r.to} · {day(r.at)}{r.auto ? " · automatic" : ""} · {r.template}</div>
                  </div>
                  <span className={cn("shrink-0 text-xs", tone[r.status])}>{label[r.status] ?? r.status}</span>
                </button>
                {open === r.id && (
                  <div className="mt-2 whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-slate-300">
                    {r.error && <div className="mb-2 text-red-300">Error: {r.error}</div>}
                    {r.body}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}

/** Who gets a text when a new church signs up. */
function AlertCard({ alert, smsLive }: { alert: OutreachData["alert"]; smsLive: boolean }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [phone, setPhone] = useState(alert.saved);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const using = phone.trim() || (alert.from === "company" ? alert.phone : "");

  async function save() {
    setSaving(true);
    const res = await saveAlertPhone(phone).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setSaving(false);
    if (res.ok) { toast("Saved. New signups will text this number.", "success"); router.refresh(); }
    else toast(res.error, "error");
  }
  async function test() {
    setTesting(true);
    if (phone.trim() !== alert.saved) await saveAlertPhone(phone).catch(() => null);
    const res = await sendAlertTest().catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setTesting(false);
    if (res.ok) toast(res.stubbed ? "Test only: SMS is not connected on this computer, so nothing was sent." : `Test text sent to ${res.to}.`, "success");
    else toast(res.error, "error");
  }

  return (
    <AdminCard className="mb-4 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><MessageSquare className="size-4 text-teal-400" /> Text me when a church signs up</div>
      <p className="mt-1 text-sm text-slate-400">
        {using ? <>Every new church sends a text to <b className="text-slate-200">{using}</b> with its name and owner.</> : <>Add your number to get a text for every new church.</>}
        {!phone.trim() && alert.from === "company" && " This is the phone in your receipt company details. Type another number to use a different one."}
        {!smsLive && " SMS is not connected where this is running, so texts are only logged."}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-56 max-w-xs flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="alert-phone">Your phone number</label>
          <input id="alert-phone" className={input} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={alert.from === "company" ? alert.phone : "024 000 0000"} maxLength={20} />
        </div>
        <button type="button" className={primary} onClick={save} disabled={saving || testing}>{saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save"}</button>
        <button type="button" className={ghost} onClick={test} disabled={saving || testing || !using}>{testing ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send me a test text</>}</button>
      </div>
    </AdminCard>
  );
}
