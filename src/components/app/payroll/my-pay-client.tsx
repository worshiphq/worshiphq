"use client";

import { useState } from "react";
import { Download, Eye, EyeOff, CalendarOff, Wallet, IdCard, LogIn, LogOut, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cancelLeave } from "@/app/actions/leave";
import { selfClock } from "@/app/actions/staff-attendance";
import { LeaveRequestForm } from "./leave-request-form";
import { BusyButton } from "./busy-button";
import { ghs, fmtDay } from "./ui";
import { cn } from "@/lib/utils";

export interface MyPayProps {
  firstName: string;
  churchName: string;
  details: { jobTitle: string | null; department: string | null; staffNo: string | null; startDate: string | null; ghanaCard: string; payout: string };
  payslips: { lineId: string; title: string; net: number; year: number; month: number; payDate: string | null }[];
  ytd: { gross: number; ssnit: number; paye: number; net: number };
  year: number;
  leave: { typeId: string; name: string; color: string; paid: boolean; entitlement: number; used: number; balance: number }[];
  types: { id: string; name: string; paid: boolean }[];
  requests: { id: string; type: string; color: string; startDate: string; endDate: string; days: number; status: string; decisionNote: string | null }[];
  clock: { on: boolean; clockIn: string | null; clockOut: string | null } | null;
}

/** Download link with a spinner and message while the PDF is made. */
function PayslipDownload({ lineId }: { lineId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a href={`/api/payroll/payslip/${lineId}?download=1`} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 4000); }}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold hover:bg-surface-2">
      {busy ? <><Spinner size="sm" /> Preparing…</> : <><Download className="size-3.5" /> Download</>}
    </a>
  );
}

export function MyPayClient(p: MyPayProps) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6">
          <div className="text-sm text-ink-muted">{greet},</div>
          <h1 className="font-display text-3xl font-bold">{p.firstName}</h1>
          <p className="mt-1 text-sm text-ink-muted">{[p.details.jobTitle, p.churchName].filter(Boolean).join(" · ")}</p>
        </div>
        {p.clock?.on && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
            <Clock className="size-4 text-primary" />
            <span className="flex-1 text-sm text-ink-muted">{p.clock.clockIn ? `In at ${new Date(p.clock.clockIn).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Not clocked in today"}{p.clock.clockOut ? `, out at ${new Date(p.clock.clockOut).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            {!p.clock.clockIn && <BusyButton size="sm" pendingLabel="Clocking in…" run={() => selfClock("in")}><LogIn className="size-4" /> Clock in</BusyButton>}
            {p.clock.clockIn && !p.clock.clockOut && <BusyButton size="sm" variant="secondary" pendingLabel="Clocking out…" run={() => selfClock("out")}><LogOut className="size-4" /> Clock out</BusyButton>}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><Wallet className="size-5 text-primary" /> Your payslips</h2>
            {p.payslips.length === 0 ? <p className="text-sm text-ink-muted">Your payslips appear here once a payroll is paid.</p> : (
              <ul className="divide-y divide-line-soft">
                {p.payslips.map((s) => (
                  <li key={s.lineId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{s.title}</div>{s.payDate && <div className="text-xs text-ink-faint">Paid {fmtDay(s.payDate)}</div>}</div>
                    <button type="button" onClick={() => setShown((x) => ({ ...x, [s.lineId]: !x[s.lineId] }))} className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums" data-no-mask aria-label={shown[s.lineId] ? "Hide amount" : "Show amount"}>
                      {shown[s.lineId] ? <>{ghs(s.net)} <EyeOff className="size-3.5 text-ink-faint" /></> : <>GHS ••••• <Eye className="size-3.5 text-ink-faint" /></>}
                    </button>
                    <PayslipDownload lineId={s.lineId} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">{p.year} so far</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {([["Gross", p.ytd.gross], ["SSNIT", p.ytd.ssnit], ["PAYE", p.ytd.paye], ["Net", p.ytd.net]] as const).map(([l, v]) => (
                <div key={l}><div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{l}</div><div className="mt-0.5 font-semibold tabular-nums">{ghs(v)}</div></div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">My leave requests</h2>
            {p.requests.length === 0 ? <p className="text-sm text-ink-muted">None yet.</p> : (
              <ul className="divide-y divide-line-soft">
                {p.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                    <span className="min-w-0 flex-1">{r.type}<span className="block text-xs text-ink-muted">{fmtDay(r.startDate, { day: "numeric", month: "short" })}{r.endDate !== r.startDate ? ` to ${fmtDay(r.endDate, { day: "numeric", month: "short" })}` : ""} · {r.days} day{r.days === 1 ? "" : "s"}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</span></span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", r.status === "approved" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : r.status === "pending" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-surface-2 text-ink-faint")}>{r.status === "pending" ? "Waiting" : r.status}</span>
                    {r.status === "pending" && <BusyButton size="sm" variant="ghost" pendingLabel="Cancelling…" run={() => cancelLeave(r.id)}>Cancel</BusyButton>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><CalendarOff className="size-5 text-primary" /> Leave left</h2>
            <ul className="space-y-3">
              {p.leave.filter((l) => l.entitlement > 0).map((l) => (
                <li key={l.typeId}><div className="flex justify-between text-sm"><span>{l.name}</span><span className="font-semibold">{l.balance}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (l.used / l.entitlement) * 100)}%`, background: l.color }} /></div></li>
              ))}
              {p.leave.every((l) => l.entitlement <= 0) && <li className="text-sm text-ink-muted">No leave set up yet.</li>}
            </ul>
          </Card>
          {p.types.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-display text-lg font-semibold">Request leave</h2>
              <LeaveRequestForm types={p.types} />
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><IdCard className="size-5 text-primary" /> My details</h2>
            <dl className="space-y-1.5 text-sm">
              {([["Staff number", p.details.staffNo], ["Job title", p.details.jobTitle], ["Department", p.details.department], ["Started", p.details.startDate ? fmtDay(p.details.startDate) : null], ["Ghana Card", p.details.ghanaCard], ["Paid to", p.details.payout]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v ?? "-"}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-faint">Something wrong? Ask the church office to update it.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
