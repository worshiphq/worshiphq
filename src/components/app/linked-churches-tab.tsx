"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2, Check, Copy, Trash2, Users, Wallet, BarChart3, Send, ArrowRight, Link2Off, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import {
  getLinkedChurches, createLinkInvite, deleteLinkInvite, acceptLinkCode, setLinkShare, setAutoAcceptTransfers, unlinkChurch,
  sendToParent, acceptTransfer, acceptAllTransfers, declineTransfer, listSendable,
  type LinkedData, type ShareKey,
} from "@/app/actions/linked-churches";
import { LINK_KINDS } from "@/lib/linked-church-kinds";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = { teens_chapel: "Teens Chapel", branch: "Branch church", partner: "Partner church" };
const SHARE_OPTIONS: { key: ShareKey; title: string; text: string; icon: typeof Users }[] = [
  { key: "headcount", title: "How many members we have", text: "Just the number of active members.", icon: Users },
  { key: "attendance", title: "Our attendance", text: "The last service's total and the average of the last four.", icon: BarChart3 },
  { key: "finances", title: "Our finances (totals only)", text: "This month's giving and expenses as totals. Never names or individual gifts.", icon: Wallet },
];

const money = (n: number) => `₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Settings, Linked churches: link a teens chapel, branch or partner church to a main church, share what you choose, and send people up. */
export function LinkedChurchesTab({ canManage }: { canManage: boolean }) {
  const { toast } = useFeedback();
  const [data, setData] = useState<LinkedData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<keyof typeof LINK_KINDS>("teens_chapel");
  const [label, setLabel] = useState("");
  const [createMissing, setCreateMissing] = useState(true);
  const [sendable, setSendable] = useState<{ id: string; name: string; age: number | null; group: string }[] | null>(null);
  const [q, setQ] = useState("");
  const [minAge, setMinAge] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const load = async () => setData(await getLinkedChurches());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    getLinkedChurches().then((d) => { if (live) { setFailed(false); setData(d); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);
  useEffect(() => {
    if (data?.parent && sendable === null) void listSendable().then(setSendable);
  }, [data?.parent, sendable]);

  const list = useMemo(() => {
    const min = Number(minAge) || 0;
    return (sendable ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && (min === 0 || (p.age !== null && p.age >= min))).slice(0, 200);
  }, [sendable, q, minAge]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, done?: string, after?: () => void) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) { toast(String(r.error ?? "Something went wrong."), "error"); return; }
      if (done) toast(done, "success");
      after?.();
      await load();
    } catch (e) { toast((e as Error).message || "Something went wrong.", "error"); }
    finally { setBusy(null); }
  }

  if (!data && failed) return <Card className="flex items-center justify-between gap-2 p-6 text-sm text-ink-muted">We could not load this. <Button size="sm" variant="secondary" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</Button></Card>;
  if (!data) return <Card className="flex items-center gap-2 p-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading…</Card>;
  const can = canManage && data.isAdmin;
  const toggleShare = (k: ShareKey) => {
    if (!data.parent) return;
    const next = data.parent.share.includes(k) ? data.parent.share.filter((s) => s !== k) : [...data.parent.share, k];
    void run("share", () => setLinkShare(next));
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><GitBranch className="size-5" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold">Linked churches</h3>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">
              A teens chapel, a branch or a partner church can run on its own account, with its own plan, members and money, and still be linked to the main church.
              Nothing is shared unless the linked church switches it on, and teens who graduate can be sent up to the main church with their details.
            </p>
          </div>
        </div>
      </Card>

      {/* ── This church is linked to a main church ── */}
      {data.parent ? (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Linked to</div>
                <div className="font-display text-xl font-bold">{data.parent.name}</div>
                <div className="text-sm text-ink-muted">{data.churchName} is its {KIND_LABEL[data.parent.kind] ?? "partner church"}.</div>
              </div>
              {can && (
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => { if (window.confirm(`Unlink from ${data.parent!.name}? People already sent stay where they are.`)) void run("unlink", () => unlinkChurch(), "Unlinked."); }}>
                  <Link2Off className="size-4" /> Unlink
                </Button>
              )}
            </div>
            <div className="mt-5">
              <div className="text-sm font-semibold">What {data.parent.name} can see about you</div>
              <p className="text-xs text-ink-muted">Nothing is shared until you switch it on. You can change this any time.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {SHARE_OPTIONS.map((o) => {
                  const on = data.parent!.share.includes(o.key);
                  return (
                    <button key={o.key} type="button" disabled={!can || busy !== null} onClick={() => toggleShare(o.key)} className={cn("rounded-xl border p-3 text-left transition-colors", on ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-line hover:bg-surface-2")}>
                      <div className="flex items-center justify-between"><o.icon className="size-4 text-primary" />{on && <Check className="size-4 text-primary" />}</div>
                      <div className="mt-1.5 text-sm font-semibold">{o.title}</div>
                      <div className="mt-0.5 text-xs text-ink-muted">{o.text}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="flex items-center gap-2 font-display text-[1rem] font-semibold"><Send className="size-4 text-primary" /> Send people to {data.parent.name}</h3>
            <p className="mt-0.5 text-sm text-ink-muted">
              For teens who are graduating. Their details, departments, groups and zones go with them. {data.parent.name} accepts them, and the names that match are connected automatically. They leave your active list, and their record stays here as history.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="min-w-[12rem] flex-1 text-xs font-medium text-ink-muted">Find someone
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name…" className="mt-1" />
              </label>
              <label className="text-xs font-medium text-ink-muted">Aged
                <Input value={minAge} onChange={(e) => setMinAge(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 18" className="mt-1 w-24" inputMode="numeric" />
                <span className="mt-0.5 block text-[10px] text-ink-faint">and over</span>
              </label>
              <Button variant="secondary" size="sm" onClick={() => setPicked(new Set([...picked, ...list.map((p) => p.id)]))} disabled={list.length === 0}>Tick all {list.length}</Button>
              {picked.size > 0 && <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Clear</Button>}
            </div>
            <div className="mt-3 max-h-64 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line">
              {sendable === null ? <p className="p-4 text-sm text-ink-muted">Loading…</p> : list.length === 0 ? <p className="p-4 text-sm text-ink-faint">Nobody matches.</p> : list.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((cur) => { const n = new Set(cur); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="size-4 accent-primary" />
                  <span className="flex-1">{p.name}</span>
                  <span className="text-xs text-ink-faint">{p.age !== null ? `${p.age} years` : "no date of birth"} · {p.group === "child" ? "child" : p.group === "teen" ? "teen" : "adult"}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="min-w-[14rem] flex-1 text-xs font-medium text-ink-muted">A note for them (optional)
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Graduating this year, was our head usher" className="mt-1" />
              </label>
              <Button disabled={!can || picked.size === 0 || busy !== null} onClick={() => void run("send", () => sendToParent({ personIds: [...picked], note }), `Sent. ${data.parent!.name} will receive them.`, () => { setPicked(new Set()); setNote(""); setSendable(null); })}>
                {busy === "send" ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <>Send {picked.size || ""} {picked.size === 1 ? "person" : "people"} <ArrowRight className="size-4" /></>}
              </Button>
            </div>
            {data.sent.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Recently sent</div>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {data.sent.map((s) => (
                    <li key={s.id} className="flex items-center justify-between"><span>{s.name}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.status === "accepted" ? "bg-success/10 text-success" : s.status === "declined" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning")}>{s.status === "pending" ? "waiting" : s.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-display text-[1rem] font-semibold"><KeyRound className="size-4 text-primary" /> Is this church linked to a main church?</h3>
          <p className="mt-0.5 text-sm text-ink-muted">If you are a teens chapel or a branch, ask the main church for a link code and enter it here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LINK-XXXXXXXX" className="w-56 font-mono" disabled={!can} />
            <Button disabled={!can || !code.trim() || busy !== null} onClick={() => void run("accept", () => acceptLinkCode(code), "Linked.", () => setCode(""))}>
              {busy === "accept" ? <><Loader2 className="size-4 animate-spin" /> Linking…</> : "Link this church"}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Churches linked to this one ── */}
      <Card className="p-6">
        <h3 className="font-display text-[1rem] font-semibold">Churches linked to {data.churchName}</h3>
        {data.children.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">None yet. Make a code below and give it to your teens chapel, branch or partner church.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.children.map((c) => (
              <div key={c.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{c.name}</div><div className="text-xs text-ink-muted">{KIND_LABEL[c.kind] ?? c.kind}</div></div>
                  {can && <button type="button" title="Unlink" className="rounded-md p-1 text-ink-faint hover:bg-danger/10 hover:text-danger" onClick={() => { if (window.confirm(`Unlink ${c.name}?`)) void run(`un-${c.id}`, () => unlinkChurch(c.id), "Unlinked."); }}><Link2Off className="size-4" /></button>}
                </div>
                {c.share.length === 0 ? (
                  <p className="mt-3 text-xs text-ink-faint">They have not shared anything with you yet.</p>
                ) : (
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {c.members !== null && <div className="flex justify-between"><dt className="text-ink-muted">Active members</dt><dd className="font-semibold">{c.members.toLocaleString()}</dd></div>}
                    {c.attendance && <div className="flex justify-between"><dt className="text-ink-muted">Last service</dt><dd className="font-semibold">{c.attendance.lastTotal} <span className="text-xs font-normal text-ink-faint">(avg {c.attendance.average4})</span></dd></div>}
                    {c.attendance?.lastService && <div className="text-xs text-ink-faint">{c.attendance.lastService}</div>}
                    {c.finances && <div className="flex justify-between"><dt className="text-ink-muted">Giving this month</dt><dd className="font-semibold">{money(c.finances.givingThisMonth)}</dd></div>}
                    {c.finances && <div className="flex justify-between"><dt className="text-ink-muted">Expenses this month</dt><dd className="font-semibold">{money(c.finances.expensesThisMonth)}</dd></div>}
                  </dl>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <div className="text-sm font-semibold">Make a link code</div>
          {data.inviteLocked && (
            <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-muted">
              Making link codes for your own teens chapel, branch or partner churches is part of the Pro plan. You can still join another church with a code it gives you.{" "}
              <a href="/app/settings?tab=billing" className="font-medium text-primary hover:underline">See plans</a>
            </p>
          )}
          <div className={data.inviteLocked ? "pointer-events-none mt-2 flex flex-wrap items-end gap-2 opacity-50" : "mt-2 flex flex-wrap items-end gap-2"}>
            <label className="text-xs font-medium text-ink-muted">What is it
              <select value={kind} onChange={(e) => setKind(e.target.value as keyof typeof LINK_KINDS)} disabled={!can} className="mt-1 block h-10 rounded-xl border border-line bg-surface px-3 text-sm">
                {Object.entries(LINK_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-ink-muted">Note (optional)
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Teens Chapel" className="mt-1 w-48" disabled={!can} />
            </label>
            <Button disabled={!can || busy !== null} onClick={() => void run("invite", () => createLinkInvite({ kind, label }), "Code made.", () => setLabel(""))}>
              {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : null} Make a code
            </Button>
          </div>
          {data.invites.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-mono font-semibold">{i.code}</span>
                  <span className="text-xs text-ink-muted">{KIND_LABEL[i.kind]}{i.label ? ` · ${i.label}` : ""} · expires {new Date(i.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  <span className="ml-auto flex gap-1">
                    <button type="button" title="Copy" className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" onClick={() => { void navigator.clipboard.writeText(i.code); toast("Code copied.", "success"); }}><Copy className="size-4" /></button>
                    <button type="button" title="Remove" className="rounded-md p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" onClick={() => void run(`del-${i.id}`, () => deleteLinkInvite(i.id))}><Trash2 className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── People sent to this church ── */}
      {(data.incoming.length > 0 || data.children.length > 0) && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-[1rem] font-semibold">People sent to {data.churchName}</h3>
            {data.incoming.length > 1 && can && (
              <Button size="sm" disabled={busy !== null} onClick={() => void run("all", () => acceptAllTransfers({ createMissing }), "Everyone accepted.")}>
                {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Accept all {data.incoming.length}
              </Button>
            )}
          </div>
          {data.incoming.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Nobody is waiting. When a linked church sends someone, they appear here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft rounded-xl border border-line">
              {data.incoming.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{t.name}{t.age !== null && <span className="ml-1.5 text-xs font-normal text-ink-faint">{t.age} years</span>}</div>
                    <div className="text-xs text-ink-muted">From {t.fromChurch}{t.phone ? ` · ${t.phone}` : ""}</div>
                    {(t.departments.length > 0 || t.groups.length > 0 || t.zones.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {[...t.departments, ...t.groups, ...t.zones].map((x, i) => <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{x}</span>)}
                      </div>
                    )}
                    {t.note && <div className="mt-1 text-xs italic text-ink-faint">&ldquo;{t.note}&rdquo;</div>}
                  </div>
                  {can && (
                    <div className="flex gap-1.5">
                      <Button size="sm" disabled={busy !== null} onClick={() => void run(`acc-${t.id}`, () => acceptTransfer(t.id, { createMissing }), `${t.name} accepted.`)}>
                        {busy === `acc-${t.id}` ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Accept
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run(`dec-${t.id}`, () => declineTransfer(t.id))}>Decline</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>Create the departments and groups that do not exist here yet<span className="block text-xs text-ink-muted">Ones with the same name are always connected. Zones are only connected when you already have a matching one.</span></span>
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={data.autoAccept} disabled={!can || busy !== null} onChange={(e) => void run("auto", () => setAutoAcceptTransfers(e.target.checked))} className="mt-0.5 size-4 accent-primary" />
            <span>Accept people from linked churches automatically<span className="block text-xs text-ink-muted">They are added as soon as they are sent, without waiting for you. Off by default.</span></span>
          </label>
        </Card>
      )}
    </div>
  );
}
