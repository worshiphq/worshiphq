"use client";

import { useState } from "react";
import { Lock, LockOpen, Paperclip, Trash2, BadgeCheck, ArrowRightLeft, Plus, Ban, Calculator, History } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { addLevyAdjustment, carryLevyCredit, closeLevyPeriods, deleteLevyPayment, reopenLevyPeriod, waiveLevy } from "@/app/actions/levies";
import { METHOD_LABELS } from "@/lib/levies/explain";
import type { ChangeView, RecordView, RuleView } from "@/lib/levies/view-types";
import { BusyButton, StatusBadge, dayMonthYear, ghs, inputCls, useLevyAction } from "./shared";

const KIND_LABEL: Record<string, string> = { manual: "Adjustment", income_change: "Giving changed after closing", carry_credit: "Extra paid moved", waiver: "Waived" };

/** Everything about one levy period: how it was worked out, what changed, what was paid, and the actions on it. */
export function RecordSheet({ rec, rule, changes, access, onClose, onPay }: {
  rec: RecordView; rule: RuleView | undefined; changes: ChangeView[]; access: { manage: boolean; del: boolean; reopen: boolean };
  onClose: () => void; onPay: () => void;
}) {
  const { pending, run } = useLevyAction();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [form, setForm] = useState<null | "adjust" | "waive" | "reopen">(null);
  const [amount, setAmount] = useState("");
  const [why, setWhy] = useState("");
  const go = (k: string, fn: Parameters<typeof run>[0], msg: Parameters<typeof run>[1], after?: () => void) => { setBusyKey(k); run(fn, msg, after); };
  const b = (k: string) => pending && busyKey === k;
  const bd = rec.breakdown;
  const versions = rule?.versions.filter((v) => bd?.versionIds?.includes(v.id)) ?? [];
  const ruleChanges = changes.filter((c) => c.ruleId === rec.ruleId).slice(0, 8);
  const closed = rec.state === "closed";
  const counting = rec.status === "counting";

  return (
    <Modal open onClose={onClose} wide title={`${rec.ruleName}, ${rec.label}`} description={`Paid to ${rec.payee}. Due ${dayMonthYear(rec.dueYmd)}.`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={rec.status} text={rec.statusText} closed={closed} />
          {closed && rec.closedByName && <span className="text-xs text-ink-muted">Closed {rec.closedAt ? dayMonthYear(rec.closedAt.slice(0, 10)) : ""} by {rec.closedByName}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {([["Due", rec.due], ["Paid", rec.paid], ["Left", rec.left]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-ink-muted">{l}</div>
              <div className={`font-display text-lg font-bold tabular-nums ${l === "Left" && v > 0 ? (rec.overdue ? "text-danger" : "text-warning") : ""}`}>{ghs(v)}</div>
            </div>
          ))}
        </div>

        {/* How it was worked out */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Calculator className="size-4 text-primary" /> How this was worked out</h4>
          <div className="rounded-xl border border-line">
            {(bd?.lines ?? []).length === 0 ? (
              <p className="p-3 text-sm text-ink-muted">Nothing to charge for this period.</p>
            ) : (
              <ul className="divide-y divide-line-soft text-sm">
                {bd!.lines.map((l, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 p-3">
                    <span className="min-w-0">{l.text.replace(/ = GH₵[\d,.]+$/, "")}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{ghs(Number(l.levy))}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1 border-t border-line bg-surface-2/60 p-3 text-sm">
              {bd?.cap && <div className="text-warning">{bd.cap}</div>}
              {rec.adjustments.map((a) => (
                <div key={a.id} className="flex justify-between gap-3 text-ink-muted"><span>{KIND_LABEL[a.kind] ?? "Adjustment"}: {a.reason}{a.byName ? ` (${a.byName})` : ""}</span><span className="shrink-0 tabular-nums">{a.amount > 0 ? "+" : ""}{ghs(a.amount)}</span></div>
              ))}
              <div className="flex justify-between font-semibold"><span>Amount due</span><span className="tabular-nums">{ghs(rec.due)}</span></div>
            </div>
          </div>
          {(bd?.warnings ?? []).map((w, i) => <p key={i} className="mt-2 text-xs text-warning">{w}</p>)}
          {versions.length > 1 && <p className="mt-2 text-xs text-ink-muted">The figures changed during this period: {versions.map((v) => `${v.summary} from ${dayMonthYear(v.fromYmd)}`).join(", then ")}.</p>}
          {counting && <p className="mt-2 text-xs text-info">Still counting until the period ends. Figures update as giving is recorded.</p>}
        </section>

        {/* Payments */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Payments</h4>
            {access.manage && <button type="button" onClick={onPay} className="flex items-center gap-1 text-sm font-semibold text-primary-bright hover:underline"><Plus className="size-4" /> Record payment</button>}
          </div>
          {rec.payments.length === 0 ? <p className="text-sm text-ink-muted">Nothing paid yet.</p> : (
            <ul className="divide-y divide-line-soft rounded-xl border border-line text-sm">
              {rec.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <span className="font-semibold tabular-nums">{ghs(p.amount)}</span>
                  <span className="text-ink-muted">{dayMonthYear(p.paidOnYmd)}, {METHOD_LABELS[p.method] ?? p.method}{p.reference ? `, ref ${p.reference}` : ""}</span>
                  {p.confirmedBy && <span className="flex items-center gap-1 text-xs font-medium text-success"><BadgeCheck className="size-3.5" /> Confirmed by {p.confirmedBy}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {p.hasProof && <a href={`/api/levies/proof/${p.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary-bright hover:bg-surface-2"><Paperclip className="size-3.5" /> Receipt</a>}
                    {access.del && (
                      <button type="button" disabled={pending} aria-label="Remove this payment" onClick={() => { if (window.confirm(`Remove this payment of ${ghs(p.amount)}?${p.expenseId ? " Its expense is removed too." : ""}`)) go(`del-${p.id}`, () => deleteLevyPayment(p.id), "Payment removed."); }}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger">{b(`del-${p.id}`) ? <Spinner size="sm" /> : <Trash2 className="size-4" />}</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Actions */}
        {access.manage && (
          <section className="flex flex-wrap gap-2 border-t border-line pt-4">
            {!closed && !counting && (
              <BusyButton size="sm" variant="secondary" busy={b("close")} busyLabel="Closing..." onClick={() => go("close", () => closeLevyPeriods([rec.id]), `${rec.label} closed. Its figures are now fixed.`, onClose)}><Lock /> Close period</BusyButton>
            )}
            {closed && access.reopen && <button type="button" onClick={() => setForm(form === "reopen" ? null : "reopen")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-surface-2"><LockOpen className="size-4" /> Reopen</button>}
            {!closed && <button type="button" onClick={() => setForm(form === "adjust" ? null : "adjust")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-surface-2"><Plus className="size-4" /> Add adjustment</button>}
            {!closed && access.reopen && rec.left > 0 && <button type="button" onClick={() => setForm(form === "waive" ? null : "waive")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-surface-2"><Ban className="size-4" /> Waive</button>}
            {rec.paid > rec.due && rec.status !== "counting" && (
              <BusyButton size="sm" variant="secondary" busy={b("carry")} busyLabel="Moving..." onClick={() => go("carry", () => carryLevyCredit(rec.id), (r) => String(r.message))}><ArrowRightLeft /> Move {ghs(rec.paid - rec.due)} extra to the next period</BusyButton>
            )}
          </section>
        )}
        {form && (
          <div className="space-y-2 rounded-xl border border-line p-3">
            {form === "adjust" && (
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount to add, or a minus amount to take off" className={inputCls} />
            )}
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={form === "waive" ? "Why is it waived? Who agreed?" : form === "reopen" ? "Why is it being reopened?" : "Why?"} className={inputCls} maxLength={300} />
            <BusyButton size="sm" busy={b(form)} busyLabel="Saving..." disabled={why.trim().length < 3 || (form === "adjust" && !Number(amount))}
              onClick={() => go(form, () => (form === "adjust" ? addLevyAdjustment(rec.id, Number(amount), why) : form === "waive" ? waiveLevy(rec.id, why) : reopenLevyPeriod(rec.id, why)),
                form === "adjust" ? "Adjustment added." : form === "waive" ? `${ghs(rec.left)} waived.` : `${rec.label} reopened. It will be worked out again.`, () => { setForm(null); setWhy(""); setAmount(""); })}>
              {form === "adjust" ? "Add adjustment" : form === "waive" ? `Waive ${ghs(rec.left)}` : "Reopen period"}
            </BusyButton>
          </div>
        )}

        {ruleChanges.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><History className="size-4 text-ink-faint" /> Changes to this levy</h4>
            <ul className="space-y-1.5 text-xs text-ink-muted">
              {ruleChanges.map((c) => <li key={c.id}><span className="text-ink-faint">{dayMonthYear(c.createdAt.slice(0, 10))}{c.byName ? `, ${c.byName}` : ""}:</span> {c.summary}</li>)}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
