"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, CalendarClock, CheckCircle2, Circle, AlertTriangle, Plus, Banknote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/input";
import { createPayrollRun } from "@/app/actions/payroll";
import { BusyButton } from "./busy-button";
import { RemitDialog } from "./remit-dialog";
import { RunStatusChip, SelfApprovedBadge, RowLink, ghs, fmtDay, field } from "./ui";
import { POSTING_LABEL } from "@/lib/payroll/defaults";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface RunRow { id: string; year: number; month: number; kind: string; title: string; status: string; headcount: number; net: number; preparedByName: string | null; approvedByName: string | null; selfApproved: boolean; paidAt: string | null }
export interface PendingRow { id: string; kind: string; label: string; amount: number; dueDate: string | null; runId: string; year: number; month: number }

export function RunsClient({ runs, pending, checklist, canManage, accounts, defaultAccountId, now }: {
  runs: RunRow[]; pending: PendingRow[]; checklist: { paidRuns: number; items: { key: string; label: string; done: boolean; href: string }[] };
  canManage: boolean; accounts: { id: string; name: string }[]; defaultAccountId: string | null; now: { year: number; month: number };
}) {
  const router = useRouter();
  const [remit, setRemit] = useState<PendingRow | null>(null);
  const [other, setOther] = useState(false);
  const live = runs.find((r) => r.kind === "regular" && r.year === now.year && r.month === now.month && r.status !== "reversed");
  const monthName = `${MONTHS[now.month - 1]} ${now.year}`;
  const todayIso = new Date().toISOString();
  const showChecklist = checklist.paidRuns === 0 && checklist.items.some((i) => !i.done);

  return (
    <div className="space-y-6">
      {/* Hero: start this month */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">This month</div>
            <h2 className="mt-1 font-display text-2xl font-bold">{monthName} payroll</h2>
            <p className="mt-1 text-sm text-ink-muted">{live ? <>Already started. <RunStatusChip status={live.status} className="ml-1 align-middle" /></> : "Builds every active staff member's pay from their pay setup. Nothing is paid until it is approved."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {live ? (
              <RowLink href={`/app/payroll/runs/${live.id}`} className="inline-flex h-11 items-center rounded-xl bg-gradient-to-b from-primary-bright to-primary px-5 text-sm font-semibold text-white">Open {MONTHS[now.month - 1]} payroll</RowLink>
            ) : canManage ? (
              <BusyButton size="lg" pendingLabel={`Starting ${MONTHS[now.month - 1]} payroll…`} run={() => createPayrollRun(now.year, now.month, "regular")} refresh={false} onDone={(r) => { if (r.ok && "id" in r && r.id) router.push(`/app/payroll/runs/${r.id}`); }}>
                <Play className="size-5" /> Start {monthName} payroll
              </BusyButton>
            ) : null}
            {canManage && <Button variant="secondary" onClick={() => setOther(true)}><Plus className="size-4" /> Another month or extra run</Button>}
          </div>
        </div>
      </Card>

      {showChecklist && (
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">Before your first payroll</h3>
          <ul className="mt-3 space-y-2">
            {checklist.items.map((i) => (
              <li key={i.key}>
                <a href={i.href} className="flex items-center gap-2 text-sm hover:text-primary">
                  {i.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-ink-faint" />}
                  <span className={cn(i.done && "text-ink-muted line-through")}>{i.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><CalendarClock className="size-5 text-primary" /> To pay over</h3>
          <ul className="mt-3 divide-y divide-line-soft">
            {pending.map((p) => {
              const overdue = !!p.dueDate && p.dueDate < todayIso;
              return (
                <li key={p.id} className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-center", overdue && "rounded-lg bg-amber-500/5 px-2")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{POSTING_LABEL[p.kind] ?? p.kind} for {MONTHS[p.month - 1]} {p.year}</div>
                    <div className={cn("text-xs", overdue ? "font-semibold text-amber-700 dark:text-amber-400" : "text-ink-muted")}>
                      {overdue && <AlertTriangle className="mr-1 inline size-3.5" />}{p.dueDate ? `${overdue ? "Was due" : "Due"} ${fmtDay(p.dueDate, { day: "numeric", month: "long", year: "numeric" })}` : "No due date"}
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{ghs(p.amount)}</span>
                  {canManage && <Button size="sm" variant="secondary" onClick={() => setRemit(p)}>Mark as paid over</Button>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Payroll runs</h3></div>
        {runs.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><Banknote className="size-5" /></div>
            <p className="mt-3 text-sm text-ink-muted">No payrolls yet. Start this month&rsquo;s above.</p>
          </div>
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y divide-line-soft md:hidden">
              {runs.map((r) => (
                <li key={r.id}>
                  <RowLink href={`/app/payroll/runs/${r.id}`} className="p-4 hover:bg-surface-2/40">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5"><RunStatusChip status={r.status} />{r.selfApproved && <SelfApprovedBadge />}</div>
                      <div className="mt-1 text-xs text-ink-muted">{r.headcount} staff · net <span className="font-semibold text-ink">{ghs(r.net)}</span></div>
                    </div>
                  </RowLink>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <table className="hidden w-full text-sm md:table">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr className="border-b border-line"><th className="px-5 py-3 font-semibold">Payroll</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 text-right font-semibold">Staff</th><th className="px-3 py-3 text-right font-semibold">Net pay</th><th className="px-3 py-3 font-semibold">Prepared / approved</th><th className="w-24" /></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-surface-2/40">
                    <td className="px-5 py-3 font-medium">{r.title}{r.kind === "supplementary" && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-faint">Extra</span>}</td>
                    <td className="px-3 py-3"><div className="flex flex-wrap items-center gap-1.5"><RunStatusChip status={r.status} />{r.selfApproved && <SelfApprovedBadge />}</div></td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.headcount}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{ghs(r.net)}</td>
                    <td className="px-3 py-3 text-xs text-ink-muted">{r.preparedByName ?? "-"}{r.approvedByName ? ` / ${r.approvedByName}` : ""}</td>
                    <td className="px-3 py-3"><RowLink href={`/app/payroll/runs/${r.id}`} className="text-xs font-semibold text-primary">Open</RowLink></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      {remit && <RemitDialog posting={remit} accounts={accounts} defaultAccountId={defaultAccountId} onClose={() => setRemit(null)} />}
      {other && <OtherRunDialog now={now} onClose={() => setOther(false)} />}
    </div>
  );
}

function OtherRunDialog({ now, onClose }: { now: { year: number; month: number }; onClose: () => void }) {
  const router = useRouter();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [kind, setKind] = useState<"regular" | "supplementary">("regular");
  return (
    <Modal open onClose={onClose} title="Start a payroll" description="A regular payroll for another month, or an extra one (for a bonus or back pay) on top of a month's regular payroll.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="or-m">Month</Label><select id="or-m" className={field} value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><Label htmlFor="or-y">Year</Label><select id="or-y" className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[now.year - 1, now.year, now.year + 1].map((y) => <option key={y}>{y}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([["regular", "Regular payroll"], ["supplementary", "Extra payroll"]] as const).map(([k, l]) => (
            <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm", kind === k ? "border-primary bg-primary/5" : "border-line")}><input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {l}</label>
          ))}
        </div>
        <BusyButton className="w-full" pendingLabel="Starting…" refresh={false} run={() => createPayrollRun(year, month, kind)} onDone={(r) => { if (r.ok && "id" in r && r.id) { onClose(); router.push(`/app/payroll/runs/${r.id}`); } }}>Start payroll</BusyButton>
      </div>
    </Modal>
  );
}
