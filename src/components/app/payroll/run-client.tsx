"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, RefreshCw, Send, ShieldCheck, Undo2, Banknote, Download, FileSpreadsheet, ChevronDown, X, Plus, Trash2, History, Mail, MessageSquare, Lock, UserRound, EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  refreshPayrollRun, submitPayrollRun, sendBackPayrollRun, approvePayrollRun, markPayrollPaid, reversePayrollRun, deletePayrollDraft,
  updatePayLine, addPayLineItem, removePayLineItem,
} from "@/app/actions/payroll";
import { sendPayslips } from "@/app/actions/payroll-notify";
import type { RunDetail } from "@/lib/data/payroll";
import { ONEOFF_EARNING_CODES, DEDUCTION_CODES, POSTING_LABEL } from "@/lib/payroll/defaults";
import { BusyButton } from "./busy-button";
import { RunStepper, RunStatusChip, SelfApprovedBadge, Figure, ghs, fmtDay, field } from "./ui";
import { RemitDialog } from "./remit-dialog";
import { cn } from "@/lib/utils";

type Line = RunDetail["lines"][number];

export function RunClient({ run, canManage, accounts, funds, defaultAccountId }: {
  run: RunDetail; canManage: boolean; accounts: { id: string; name: string }[]; funds: { id: string; name: string; restricted: boolean }[]; defaultAccountId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "pay" | "reverse" | "sendBack" | "payslips">(null);
  const [remit, setRemit] = useState<RunDetail["postings"][number] | null>(null);
  const [moreTotals, setMoreTotals] = useState(false);
  const router = useRouter();
  const t = run.totals;
  const deductions = t.ssnitEmployee + t.paye + t.otherDeductions;
  const editable = canManage && run.status === "draft";
  const line = run.lines.find((l) => l.id === open) ?? null;
  const active = run.lines.filter((l) => !l.excluded);
  const left = run.lines.filter((l) => l.excluded);
  const monthWord = run.title.split(" ")[0]?.toUpperCase() ?? "";

  return (
    <div className="space-y-5 pb-28">
      {/* Header + stepper */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{run.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
              <RunStatusChip status={run.status} />
              {run.people.selfApproved && <SelfApprovedBadge />}
              {run.kind === "supplementary" && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase">Extra payroll</span>}
              <span>{t.headcount} staff</span>
              {run.payDate && <span>· paid {fmtDay(run.payDate)}{run.accountName ? ` from ${run.accountName}` : ""}</span>}
            </div>
          </div>
          <div className="text-right text-xs text-ink-faint">
            <div>Rates: SSNIT {run.rules.ssnitEePct}% + {run.rules.ssnitErPct}%{run.rules.statutoryMode === "none" ? " (off)" : ""}</div>
            <div className="max-w-[16rem] truncate">PAYE: {run.rules.bandSetName}</div>
          </div>
        </div>
        <div className="mt-6"><RunStepper status={run.status} people={run.people} /></div>
        {run.status === "reversed" && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            Reversed by {run.people.reversedByName} on {fmtDay(run.people.reversedAt)} ({run.people.reversalMode === "returned" ? "the money came back" : "it was never paid out"}). {run.people.reversalReason}
          </div>
        )}
      </Card>

      {/* Warnings */}
      {run.warnings.length > 0 && (run.status === "draft" || run.status === "review") && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <ul className="space-y-1.5 text-sm">
            {run.warnings.map((w) => <li key={w} className="flex items-start gap-2 text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</li>)}
          </ul>
        </Card>
      )}
      {run.status === "review" && !run.approval.ok && canManage && (
        <Card className="flex items-start gap-2 p-4 text-sm text-ink-muted"><Lock className="mt-0.5 size-4 shrink-0 text-primary" />{run.approval.reason}</Card>
      )}

      {/* Totals bar (sticky) */}
      <div className="sticky top-2 z-20">
        <Card className="border-primary/20 p-4 shadow-lg backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="hidden flex-1 grid-cols-4 gap-4 md:grid">
              <Figure label="Gross" value={ghs(t.gross)} />
              <Figure label="Deductions" value={ghs(deductions)} />
              <Figure label="Net pay" value={ghs(t.net)} strong />
              <Figure label="Employer cost" value={ghs(t.employerCost)} />
            </div>
            <div className="flex flex-1 items-center justify-between md:hidden">
              <Figure label="Net pay" value={ghs(t.net)} strong />
              <button type="button" onClick={() => setMoreTotals((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">More <ChevronDown className={cn("size-4 transition-transform", moreTotals && "rotate-180")} /></button>
            </div>
          </div>
          {moreTotals && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 md:hidden">
              <Figure label="Gross" value={ghs(t.gross)} />
              <Figure label="Deductions" value={ghs(deductions)} />
              <Figure label="SSNIT (both)" value={ghs(t.ssnitEmployee + t.ssnitEmployer)} />
              <Figure label="Employer cost" value={ghs(t.employerCost)} />
            </div>
          )}
          <div className="mt-2 hidden gap-4 text-xs text-ink-muted md:flex">
            <span>SSNIT employee {ghs(t.ssnitEmployee)}</span><span>SSNIT employer {ghs(t.ssnitEmployer)}</span><span>PAYE {ghs(t.paye)}</span><span>Other deductions {ghs(t.otherDeductions)}</span>
          </div>
        </Card>
      </div>

      {/* Lines */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h3 className="font-display text-lg font-semibold">Pay lines</h3>
          {editable && <span className="text-xs text-ink-muted">Tap a person to change their pay for this month</span>}
        </div>
        {/* Phones */}
        <ul className="divide-y divide-line-soft md:hidden">
          {active.map((l) => (
            <li key={l.id} className="p-4">
              <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setExpanded(expanded === l.id ? null : l.id)} aria-expanded={expanded === l.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.staffName}{l.isMine && <span className="ml-1 text-xs text-primary">(you)</span>}</div>
                  <div className="truncate text-xs text-ink-muted">{l.jobTitle ?? l.departmentName ?? ""}</div>
                </div>
                <div className={cn("text-right font-bold tabular-nums", l.net < 0 && "text-danger")}>{ghs(l.net)}</div>
                <ChevronDown className={cn("size-4 text-ink-faint transition-transform", expanded === l.id && "rotate-180")} />
              </button>
              {expanded === l.id && <LineBreakdown l={l} />}
              {expanded === l.id && editable && <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setOpen(l.id)}>Change this month&rsquo;s pay</Button>}
            </li>
          ))}
        </ul>
        {/* Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-semibold">Staff</th><th className="px-3 py-3 text-right font-semibold">Basic</th><th className="px-3 py-3 text-right font-semibold">Gross</th>
                <th className="px-3 py-3 text-right font-semibold">SSNIT</th><th className="px-3 py-3 text-right font-semibold">PAYE</th><th className="px-3 py-3 text-right font-semibold">Other</th>
                <th className="px-3 py-3 text-right font-semibold">Net</th><th className="px-3 py-3 font-semibold">Paid to</th>
              </tr>
            </thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.id} onClick={() => editable ? setOpen(l.id) : setExpanded(expanded === l.id ? null : l.id)} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.staffName}{l.isMine && <span className="ml-1 text-xs text-primary">(you)</span>}</div>
                    <div className="text-xs text-ink-faint">{[l.staffNo, l.jobTitle].filter(Boolean).join(" · ")}{l.unpaidDays > 0 ? ` · ${l.unpaidDays} unpaid day${l.unpaidDays === 1 ? "" : "s"}` : ""}</div>
                    {expanded === l.id && !editable && <LineBreakdown l={l} />}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{ghs(l.basic)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{ghs(l.gross)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{ghs(l.ssnitEmployee)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{ghs(l.paye)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{ghs(l.preTaxDeductions + l.otherDeductions)}</td>
                  <td className={cn("px-3 py-3 text-right font-bold tabular-nums", l.net < 0 && "text-danger")}>{ghs(l.net)}</td>
                  <td className="px-3 py-3 text-xs text-ink-muted">{l.payoutLabel ?? <span className="text-amber-600">Not set</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {left.length > 0 && (
          <div className="border-t border-line p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"><EyeOff className="size-3.5" /> Left out of this payroll</div>
            <div className="flex flex-wrap gap-2">
              {left.map((l) => <button key={l.id} type="button" disabled={!editable} onClick={() => setOpen(l.id)} className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted hover:bg-surface-2">{l.staffName}</button>)}
            </div>
          </div>
        )}
      </Card>

      {/* Postings */}
      {run.postings.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg font-semibold">Money out</h3>
          <ul className="divide-y divide-line-soft">
            {run.postings.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">{POSTING_LABEL[p.kind] ?? p.kind}<span className="block text-xs text-ink-faint">{p.status === "posted" ? `Recorded ${fmtDay(p.postedAt)}${p.reference ? `, ref ${p.reference}` : ""}` : p.status === "pending" ? `Due ${fmtDay(p.dueDate)}` : "Reversed"}</span></span>
                <span className="font-semibold tabular-nums">{ghs(p.amount)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", p.status === "posted" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : p.status === "pending" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-surface-2 text-ink-faint")}>{p.status === "posted" ? "Recorded" : p.status === "pending" ? "To pay over" : "Reversed"}</span>
                {canManage && p.status === "pending" && run.status === "paid" && <Button size="sm" variant="secondary" onClick={() => setRemit(p)}>Mark as paid over</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Activity */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><History className="size-5 text-primary" /> Activity</h3>
        <ol className="relative space-y-3 border-l border-line pl-5">
          {run.events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-surface bg-primary" />
              <div className="text-sm">{e.detail ?? e.action}</div>
              <div className="text-xs text-ink-faint">{e.actorName ?? "Someone"} · {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            </li>
          ))}
        </ol>
      </Card>

      {/* Action bar */}
      {canManage && run.status !== "reversed" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
            {run.status === "draft" && (
              <>
                <BusyButton variant="ghost" size="sm" className="mr-auto text-danger" pendingLabel="Deleting…" confirm="Delete this draft payroll?" refresh={false} run={() => deletePayrollDraft(run.id)} onDone={(r) => r.ok && router.push("/app/payroll")}><Trash2 className="size-4" /> Delete draft</BusyButton>
                <BusyButton variant="secondary" pendingLabel="Refreshing…" run={() => refreshPayrollRun(run.id, run.version)}><RefreshCw className="size-4" /> Refresh from pay setup</BusyButton>
                <BusyButton pendingLabel="Sending for approval…" run={() => submitPayrollRun(run.id, run.version)}><Send className="size-4" /> Send for approval</BusyButton>
              </>
            )}
            {run.status === "review" && (
              <>
                <Button variant="secondary" onClick={() => setDialog("sendBack")}><Undo2 className="size-4" /> Send back</Button>
                <span title={run.approval.ok ? undefined : run.approval.reason}>
                  <BusyButton disabled={!run.approval.ok} pendingLabel="Approving…" run={() => approvePayrollRun(run.id, run.version)}><ShieldCheck className="size-4" /> {run.approval.ok && run.approval.selfApproved ? "Approve (self-approve)" : "Approve"}</BusyButton>
                </span>
              </>
            )}
            {run.status === "approved" && (
              <>
                <a href={`/api/payroll/runs/${run.id}/payslips`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"><Download className="size-4" /> Preview payslips</a>
                <Button onClick={() => setDialog("pay")}><Banknote className="size-4" /> Mark as paid</Button>
              </>
            )}
            {run.status === "paid" && (
              <>
                <Button variant="ghost" size="sm" className="mr-auto text-danger" onClick={() => setDialog("reverse")}><Undo2 className="size-4" /> Reverse this payroll</Button>
                <a href={`/app/payroll/reports?run=${run.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"><FileSpreadsheet className="size-4" /> Reports</a>
                <a href={`/api/payroll/runs/${run.id}/payslips`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"><Download className="size-4" /> All payslips</a>
                <Button onClick={() => setDialog("payslips")}><Send className="size-4" /> Send payslips</Button>
              </>
            )}
          </div>
        </div>
      )}
      {run.status === "paid" && !canManage && (
        <div className="flex flex-wrap gap-2">
          <a href={`/api/payroll/runs/${run.id}/payslips`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"><Download className="size-4" /> All payslips</a>
          <a href={`/app/payroll/reports?run=${run.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"><FileSpreadsheet className="size-4" /> Reports</a>
        </div>
      )}

      {line && <LineEditor line={line} version={run.version} editable={editable} onClose={() => setOpen(null)} />}
      {dialog === "pay" && <MarkPaidDialog run={run} accounts={accounts} funds={funds} defaultAccountId={defaultAccountId} onClose={() => setDialog(null)} />}
      {dialog === "reverse" && <ReverseDialog run={run} monthWord={monthWord} onClose={() => setDialog(null)} />}
      {dialog === "sendBack" && <SendBackDialog run={run} onClose={() => setDialog(null)} />}
      {dialog === "payslips" && <SendPayslipsDialog run={run} onClose={() => setDialog(null)} />}
      {remit && <RemitDialog posting={remit} accounts={accounts} defaultAccountId={defaultAccountId} onClose={() => setRemit(null)} />}
    </div>
  );
}

function LineBreakdown({ l }: { l: Line }) {
  const earnings = [{ label: "Basic salary", amount: l.basic }, ...l.items.filter((i) => i.kind === "earning").map((i) => ({ label: i.label, amount: i.amount }))];
  const deductions = [
    ...(l.ssnitEmployee ? [{ label: "SSNIT (employee)", amount: l.ssnitEmployee }] : []),
    ...(l.paye ? [{ label: `PAYE${l.specialTax ? ` (incl. ${ghs(l.specialTax)} flat-rate)` : ""}`, amount: l.paye }] : []),
    ...l.items.filter((i) => i.kind === "deduction").map((i) => ({ label: i.label, amount: i.amount })),
  ];
  const row = (r: { label: string; amount: number }, i: number) => <div key={i} className="flex justify-between gap-3 py-0.5"><span className="truncate text-ink-muted">{r.label}</span><span className={cn("tabular-nums", r.amount < 0 && "text-danger")}>{ghs(r.amount)}</span></div>;
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-surface-2/50 p-3 text-xs sm:grid-cols-2">
      <div><div className="mb-1 font-semibold uppercase tracking-wide text-ink-faint">Earnings</div>{earnings.map(row)}<div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Gross</span><span className="tabular-nums">{ghs(l.gross)}</span></div></div>
      <div><div className="mb-1 font-semibold uppercase tracking-wide text-ink-faint">Deductions</div>{deductions.length ? deductions.map(row) : <span className="text-ink-faint">None</span>}<div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Net pay</span><span className="tabular-nums">{ghs(l.net)}</span></div></div>
      <div className="text-ink-faint sm:col-span-2">Taxable {ghs(l.taxableIncome)} · employer SSNIT {ghs(l.ssnitEmployer)} · {l.workingDays} working days{l.note ? ` · ${l.note}` : ""}</div>
    </div>
  );
}

function LineEditor({ line, version, editable, onClose }: { line: Line; version: number; editable: boolean; onClose: () => void }) {
  const [unpaid, setUnpaid] = useState(String(line.unpaidDays));
  const [note, setNote] = useState(line.note ?? "");
  const [adding, setAdding] = useState<"earning" | "deduction" | null>(null);
  const [code, setCode] = useState("bonus");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [preTax, setPreTax] = useState(false);
  const codes = adding === "deduction" ? DEDUCTION_CODES : ONEOFF_EARNING_CODES;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Pay for ${line.staffName}`} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><h2 className="font-display text-lg font-semibold">{line.staffName}</h2><div className="text-xs text-ink-muted">{line.jobTitle ?? ""}{line.isMine ? " · this is your own pay line" : ""}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-primary/5 p-4">
            <Figure label="Gross" value={ghs(line.gross)} /><Figure label="Deductions" value={ghs(line.ssnitEmployee + line.paye + line.preTaxDeductions + line.otherDeductions)} /><Figure label="Net" value={ghs(line.net)} strong />
          </div>
          <LineBreakdown l={line} />
          {editable && (
            <>
              {line.isMine && <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"><UserRound className="mt-0.5 size-4 shrink-0" />This is your own pay. If you change it, another payroll manager must approve this payroll.</p>}
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div><Label htmlFor="le-u">Unpaid days this month (out of {line.workingDays})</Label><Input id="le-u" inputMode="decimal" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} /></div>
                <BusyButton variant="secondary" pendingLabel="Saving…" run={() => updatePayLine(line.id, version, { unpaidDays: Number(unpaid) })}>Save</BusyButton>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setAdding("earning"); setCode("bonus"); setTaxable(true); }}><Plus className="size-4" /> Add a one-off payment</Button>
                <Button size="sm" variant="secondary" onClick={() => { setAdding("deduction"); setCode("other"); setPreTax(false); }}><Plus className="size-4" /> Add a one-off deduction</Button>
              </div>
              {adding && (
                <div className="space-y-3 rounded-xl border border-line p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label htmlFor="le-c">Type</Label><select id="le-c" className={field} value={code} onChange={(e) => setCode(e.target.value)}>{codes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                    <div><Label htmlFor="le-a">Amount (GHS)</Label><Input id="le-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                  </div>
                  <div><Label htmlFor="le-l">Name on the payslip</Label><Input id="le-l" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={codes.find((c) => c.code === code)?.label} /></div>
                  {adding === "earning" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> Taxable</label>
                    : <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preTax} onChange={(e) => setPreTax(e.target.checked)} /> Taken before tax</label>}
                  <div className="flex gap-2">
                    <BusyButton pendingLabel="Adding…" run={() => addPayLineItem(line.id, version, { kind: adding, code, label, amount, taxable, preTax })} onDone={(r) => { if (r.ok) { setAdding(null); setAmount(""); setLabel(""); } }}>Add</BusyButton>
                    <Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              {line.items.some((i) => i.source === "oneoff") && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">One-off items</div>
                  <ul className="space-y-1">
                    {line.items.filter((i) => i.source === "oneoff").map((i) => (
                      <li key={i.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{i.label}</span><span className="tabular-nums">{ghs(i.amount)}</span>
                        <BusyButton size="sm" variant="ghost" className="h-7 px-1.5" aria-label={`Remove ${i.label}`} pendingLabel="Removing…" run={() => removePayLineItem(i.id, version)}><Trash2 className="size-3.5" /></BusyButton></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div><Label htmlFor="le-n">Note (shows on the run, not the payslip)</Label><Input id="le-n" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <BusyButton variant="secondary" pendingLabel="Saving…" run={() => updatePayLine(line.id, version, { note })}>Save</BusyButton>
              </div>
              <BusyButton variant="ghost" className={line.excluded ? "" : "text-danger"} pendingLabel="Saving…" run={() => updatePayLine(line.id, version, { excluded: !line.excluded })} onDone={(r) => r.ok && onClose()}>
                {line.excluded ? "Put back into this payroll" : "Leave out of this payroll"}
              </BusyButton>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MarkPaidDialog({ run, accounts, funds, defaultAccountId, onClose }: { run: RunDetail; accounts: { id: string; name: string }[]; funds: { id: string; name: string; restricted: boolean }[]; defaultAccountId: string | null; onClose: () => void }) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState("");
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? "no account";
  const t = run.totals;
  const ssnit = t.ssnitEmployee + t.ssnitEmployer;
  return (
    <Modal open onClose={onClose} title="Mark as paid" description="Do this after the money has gone out to staff.">
      <div className="space-y-4">
        <div>
          <Label htmlFor="mp-a">Paid from</Label>
          <select id="mp-a" className={field} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">No account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="mp-d">Pay date</Label><Input id="mp-d" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
          {funds.length > 0 && (
            <div><Label htmlFor="mp-f">Fund (optional)</Label><select id="mp-f" className={field} value={fundId} onChange={(e) => setFundId(e.target.value)}><option value="">None</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}{f.restricted ? " (restricted)" : ""}</option>)}</select></div>
          )}
        </div>
        <p className="rounded-xl bg-surface-2/60 p-4 text-sm text-ink-muted">
          This will record <strong className="text-ink">{ghs(t.net)}</strong> net pay as an expense from <strong className="text-ink">{accountName}</strong>.
          {run.rules.statutoryMode !== "none" && <> SSNIT ({ghs(ssnit)}) and PAYE ({ghs(t.paye)}) will wait in To pay over until you pay them.</>}
          {" "}Loan recoveries are taken off what each person owes.
        </p>
        <BusyButton className="w-full" pendingLabel="Marking as paid…" run={() => markPayrollPaid(run.id, run.version, { accountId, payDate, fundId })} onDone={(r) => r.ok && onClose()}><Banknote className="size-4" /> Mark as paid</BusyButton>
      </div>
    </Modal>
  );
}

function ReverseDialog({ run, monthWord, onClose }: { run: RunDetail; monthWord: string; onClose: () => void }) {
  const [mode, setMode] = useState<"never_paid" | "returned">("never_paid");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <Modal open onClose={onClose} title="Reverse this payroll" description="Use this when a payroll was marked as paid by mistake. Everything is kept in the payroll activity.">
      <div className="space-y-4">
        {([["never_paid", "It was never paid out", "The payroll expenses are removed from the books."], ["returned", "The money came back", "A correction is posted as money in, so the books still show both."]] as const).map(([k, t, d]) => (
          <label key={k} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", mode === k ? "border-primary bg-primary/5" : "border-line")}>
            <input type="radio" checked={mode === k} onChange={() => setMode(k)} className="mt-1" />
            <span><span className="block text-sm font-semibold">{t}</span><span className="block text-xs text-ink-muted">{d}</span></span>
          </label>
        ))}
        <div><Label htmlFor="rv-r">Why?</Label><Textarea id="rv-r" className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div><Label htmlFor="rv-c">Type {monthWord} to confirm</Label><Input id="rv-c" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></div>
        <BusyButton variant="danger" className="w-full" disabled={confirm.trim().toUpperCase() !== monthWord || !reason.trim()} pendingLabel="Reversing…" run={() => reversePayrollRun(run.id, run.version, { mode, reason, confirmText: confirm })} onDone={(r) => r.ok && onClose()}>
          <Undo2 className="size-4" /> Reverse payroll
        </BusyButton>
      </div>
    </Modal>
  );
}

function SendBackDialog({ run, onClose }: { run: RunDetail; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title="Send back for changes" description="It goes back to draft so it can be corrected.">
      <div className="space-y-4">
        <div><Label htmlFor="sb-n">What needs changing?</Label><Textarea id="sb-n" className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <BusyButton className="w-full" pendingLabel="Sending back…" run={() => sendBackPayrollRun(run.id, run.version, note)} onDone={(r) => r.ok && onClose()}>Send back</BusyButton>
      </div>
    </Modal>
  );
}

function SendPayslipsDialog({ run, onClose }: { run: RunDetail; onClose: () => void }) {
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const sentBefore = useMemo(() => run.lines.filter((l) => l.emailedAt || l.smsAt).length, [run.lines]);
  return (
    <Modal open onClose={onClose} title="Send payslips" description="Staff with a WorshipHQ login get a link; others get the PDF by email.">
      <div className="space-y-4">
        <label className="flex items-start gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="mt-1" /><span><span className="flex items-center gap-1.5 text-sm font-semibold"><Mail className="size-4" /> Email</span><span className="block text-xs text-ink-muted">Sent privately: the email is not kept in your email records.</span></span></label>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} className="mt-1" /><span><span className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="size-4" /> Text message</span><span className="block text-xs text-ink-muted">Says the payslip is ready. Uses SMS credits. No amount unless switched on in Payroll settings.</span></span></label>
        {sentBefore > 0 && <p className="text-xs text-ink-muted">{sentBefore} staff were already sent theirs. They get it again.</p>}
        <BusyButton className="w-full" disabled={!email && !sms} pendingLabel="Sending payslips…" run={() => sendPayslips(run.id, { email, sms })} onDone={(r) => r.ok && onClose()}><Send className="size-4" /> Send</BusyButton>
      </div>
    </Modal>
  );
}
