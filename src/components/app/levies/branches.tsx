"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, EyeOff, Paperclip, Plus, Send, Trash2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { confirmBranchLevyPayment, getBranchLeviesAction, publishLevySchedule } from "@/app/actions/levies";
import { METHOD_LABELS } from "@/lib/levies/explain";
import type { BranchChild, LeviesPageData, ScheduleItem } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { BusyButton, FREQ_LABEL, StatusBadge, dayMonthYear, ghs, inputCls, selectCls, useLevyAction } from "./shared";

function ChildCard({ c, canConfirm, onDone }: { c: BranchChild; canConfirm: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useLevyAction();
  const [busy, setBusy] = useState<string | null>(null);
  if (!c.shares) {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <EyeOff className="mt-0.5 size-4 text-ink-faint" />
          <div><div className="font-semibold">{c.name}</div><p className="text-sm text-ink-muted">{c.name} has not chosen to share levies with you. They can switch it on in Settings, Linked churches.</p></div>
        </div>
      </Card>
    );
  }
  return (
    <Card className={cn("p-0", c.overdueCount && "border-danger/30")}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{c.name}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-4">
            <span><span className="text-ink-faint">Owed </span><b className="tabular-nums">{ghs(c.owed)}</b></span>
            <span><span className="text-ink-faint">Paid </span><b className="tabular-nums text-success">{ghs(c.paid)}</b></span>
            <span className={c.overdueCount ? "text-danger" : "text-ink-muted"}>{c.overdueCount ? `${c.overdueCount} overdue, ${ghs(c.overdueTotal)}` : "Nothing overdue"}</span>
            <span className="text-ink-muted">{c.lastPaidOn ? `Last paid ${dayMonthYear(c.lastPaidOn)}` : "No payment yet"}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[...c.records].reverse().map((r) => (
              <span key={r.id} title={`${r.ruleName}, ${r.label}: ${r.statusText}`} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", r.status === "paid" || r.status === "credit" ? "bg-success/15 text-success" : r.status === "overdue" ? "bg-danger/15 text-danger" : r.status === "counting" ? "bg-info/15 text-info" : "bg-warning/15 text-warning")}>{r.short}</span>
            ))}
          </div>
        </div>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-ink-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y divide-line-soft border-t border-line">
          {c.records.length === 0 && <li className="p-4 text-sm text-ink-muted">They have no levies set up as payable to you this year.</li>}
          {c.records.map((r) => (
            <li key={r.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.ruleName}, {r.label}</span>
                <StatusBadge status={r.status} text={r.statusText} />
                <span className="ml-auto tabular-nums text-ink-muted">Due {ghs(r.due)}, paid {ghs(r.paid)}</span>
              </div>
              {r.payments.map((p) => (
                <div key={p.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <b className="tabular-nums">{ghs(p.amount)}</b>
                  <span className="text-ink-muted">{dayMonthYear(p.paidOnYmd)}, {METHOD_LABELS[p.method] ?? p.method}{p.reference ? `, ref ${p.reference}` : ""}</span>
                  {p.hasProof && <a href={`/api/levies/proof/${p.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary-bright hover:underline"><Paperclip className="size-3" /> Receipt</a>}
                  <span className="ml-auto">
                    {p.confirmedBy ? <span className="flex items-center gap-1 font-medium text-success"><BadgeCheck className="size-3.5" /> Received</span>
                      : canConfirm && (
                        <BusyButton size="sm" variant="secondary" className="h-8" busy={pending && busy === p.id} busyLabel="Confirming..." onClick={() => { setBusy(p.id); run(() => confirmBranchLevyPayment(p.id), `Marked ${ghs(p.amount)} from ${c.name} as received.`, onDone); }}>Confirm received</BusyButton>
                      )}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ScheduleEditor({ initial, canPublish }: { initial: ScheduleItem[]; canPublish: boolean }) {
  const [items, setItems] = useState<ScheduleItem[]>(initial);
  const { pending, run } = useLevyAction();
  const set = (i: number, patch: Partial<ScheduleItem>) => setItems((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => setItems((p) => [...p, { name: "", payee: "", kind: "percent", rate: null, fixedAmount: null, frequency: "monthly", dueDays: 15, sourceHint: "tithes", note: null }]);
  return (
    <Card className="p-5">
      <h3 className="font-display text-[1rem] font-semibold">Suggested levies for your linked churches</h3>
      <p className="text-xs text-ink-muted">Linked churches see these and can add them with one tap. Each church can change its copy; nothing changes for them until they add it.</p>
      <div className="mt-3 space-y-2">
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_120px_120px_130px_auto]">
            <input value={it.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name, e.g. Tithe share" className={inputCls} disabled={!canPublish} aria-label="Name" />
            <select value={it.kind} onChange={(e) => set(i, { kind: e.target.value as ScheduleItem["kind"] })} className={selectCls} disabled={!canPublish} aria-label="Kind">
              <option value="percent">Percent</option><option value="fixed">Fixed</option>
            </select>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={(it.kind === "percent" ? it.rate : it.fixedAmount) ?? ""} onChange={(e) => set(i, it.kind === "percent" ? { rate: e.target.value === "" ? null : Number(e.target.value) } : { fixedAmount: e.target.value === "" ? null : Number(e.target.value) })} placeholder={it.kind === "percent" ? "%" : "GH₵"} className={inputCls} disabled={!canPublish} aria-label="Amount" />
            {it.kind === "percent" ? (
              <select value={it.sourceHint ?? "tithes"} onChange={(e) => set(i, { sourceHint: e.target.value as ScheduleItem["sourceHint"] })} className={selectCls} disabled={!canPublish} aria-label="Of">
                <option value="tithes">of tithes</option><option value="offertory">of offerings</option><option value="tithes_offertory">of both</option><option value="all">of all income</option>
              </select>
            ) : (
              <select value={it.frequency} onChange={(e) => set(i, { frequency: e.target.value as ScheduleItem["frequency"] })} className={selectCls} disabled={!canPublish} aria-label="How often">
                {(["monthly", "quarterly", "yearly"] as const).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
              </select>
            )}
            {canPublish && <button type="button" onClick={() => setItems((p) => p.filter((_, j) => j !== i))} aria-label="Remove" className="grid size-11 place-items-center rounded-xl text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </div>
      {canPublish && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={add} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2"><Plus className="size-4" /> Add a suggestion</button>
          <BusyButton busy={pending} busyLabel="Publishing..." onClick={() => run(() => publishLevySchedule(items.filter((x) => x.name.trim())), (r) => `Published ${r.count} suggested lev${r.count === 1 ? "y" : "ies"}.`)}><Send /> Publish</BusyButton>
        </div>
      )}
    </Card>
  );
}

/** Max: what each linked church owes this church and has paid, receipts to confirm, and suggested levies to publish. */
export function BranchesView({ data, canPublish }: { data: LeviesPageData; canPublish: boolean }) {
  const [kids, setKids] = useState<BranchChild[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (data.access.branchLocked) return;
    let live = true;
    getBranchLeviesAction(data.year).then((k) => { if (live) setKids(k); }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [data.year, data.access.branchLocked, tick]);

  if (data.access.branchLocked) {
    return (
      <Card className="p-6 text-center">
        <Lock className="mx-auto size-6 text-ink-faint" />
        <h3 className="mt-2 font-display text-lg font-semibold">Branch oversight is part of the Max plan</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">See what each linked church owes you and has paid, confirm the money arrived, and publish suggested levies they can add in one tap.</p>
        <a href="/app/settings?tab=billing" className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white">See plans</a>
      </Card>
    );
  }
  const totals = (kids ?? []).filter((k) => k.shares).reduce((t, k) => ({ owed: t.owed + k.owed, paid: t.paid + k.paid, overdue: t.overdue + k.overdueTotal }), { owed: 0, paid: 0, overdue: 0 });
  return (
    <div className="space-y-4">
      {kids === null && !error ? (
        <p className="flex items-center gap-2 p-6 text-sm text-ink-muted"><Spinner size="sm" /> Loading your linked churches...</p>
      ) : error ? (
        <p className="rounded-xl bg-danger/10 p-4 text-sm text-danger">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {([["Owed to you", totals.owed, ""], ["Paid to you", totals.paid, "text-success"], ["Overdue", totals.overdue, totals.overdue ? "text-danger" : ""]] as const).map(([l, v, c]) => (
              <div key={l} className="card-surface p-4"><div className="text-xs text-ink-muted">{l} in {data.year}</div><div className={cn("font-display text-xl font-bold tabular-nums", c)}>{ghs(v)}</div></div>
            ))}
          </div>
          {kids!.length === 0 ? <p className="text-sm text-ink-muted">No churches are linked to yours yet. Link one in Settings, Linked churches.</p>
            : kids!.map((c) => <ChildCard key={c.id} c={c} canConfirm={data.access.manage} onDone={() => setTick((t) => t + 1)} />)}
        </>
      )}
      <ScheduleEditor initial={data.ownSchedule} canPublish={canPublish} />
    </div>
  );
}
