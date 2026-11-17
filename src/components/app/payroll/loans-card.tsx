"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { createStaffLoan, writeOffLoan } from "@/app/actions/payroll";
import { BusyButton } from "./busy-button";
import { ghs, field, fmtDay } from "./ui";
import { cn } from "@/lib/utils";

export interface LoanView { id: string; ref: string; kind: string; label: string; principal: number; installment: number; balance: number; status: string; startPeriod: string; issuedAt: string }

export function LoansCard({ staffId, loans, accounts, canManage, defaultAccountId }: { staffId: string; loans: LoanView[]; accounts: { id: string; name: string }[]; canManage: boolean; defaultAccountId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();
  const now = new Date();
  const nextMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><HandCoins className="size-5 text-primary" /> Loans and advances</h3>
        {canManage && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus className="size-4" /> Give a loan or advance</Button>}
      </div>
      {loans.length === 0 ? <p className="text-sm text-ink-muted">None. Recoveries are taken from pay each month until the balance is cleared.</p> : (
        <ul className="space-y-3">
          {loans.map((l) => {
            const paid = l.principal - l.balance;
            const pct = l.principal > 0 ? Math.round((paid / l.principal) * 100) : 0;
            return (
              <li key={l.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{l.label} <span className="font-normal text-ink-faint">{l.ref}</span></div>
                    <div className="text-xs text-ink-muted">{ghs(l.installment)} a month from {l.startPeriod} · given {fmtDay(l.issuedAt)}</div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", l.status === "active" ? "bg-primary/10 text-primary" : l.status === "cleared" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-surface-2 text-ink-faint")}>{l.status.replace("_", " ")}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1 flex justify-between text-xs text-ink-muted"><span>{ghs(paid)} recovered</span><span>{ghs(l.balance)} left of {ghs(l.principal)}</span></div>
                {canManage && l.status === "active" && (
                  <BusyButton size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs text-ink-muted" pendingLabel="Writing off…" run={async () => {
                    const reason = window.prompt("Why is this being written off?");
                    if (!reason) return { ok: false, error: "Nothing was changed." };
                    return writeOffLoan(l.id, reason);
                  }}>Write off</BusyButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Give a loan or advance" description="The ledger shows only the loan number, never the name.">
          <form className="space-y-4" action={(fd) => start(async () => {
            const r = await createStaffLoan(staffId, fd);
            if (r.ok) { toast(r.message ?? "Saved", "success"); setOpen(false); router.refresh(); } else toast(r.error, "error");
          })}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="kind" value="loan" defaultChecked /> Loan</label>
              <label className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="kind" value="advance" /> Salary advance</label>
            </div>
            <div><Label htmlFor="ln-label">Description</Label><Input id="ln-label" name="label" placeholder="e.g. School fees loan" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="ln-p">Amount given (GHS)</Label><Input id="ln-p" name="principal" inputMode="decimal" required /></div>
              <div><Label htmlFor="ln-i">Taken back each month (GHS)</Label><Input id="ln-i" name="installment" inputMode="decimal" required /></div>
              <div><Label htmlFor="ln-s">First month to take it back</Label><Input id="ln-s" name="startPeriod" type="month" defaultValue={nextMonth} required /></div>
              <div>
                <Label htmlFor="ln-a">Paid from account</Label>
                <select id="ln-a" name="accountId" defaultValue={defaultAccountId ?? ""} className={field}><option value="">Choose</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="postExpense" defaultChecked className="mt-0.5" /> <span>Record it as money out of that account now <span className="block text-xs text-ink-muted">Untick if it was already recorded.</span></span></label>
            <div><Label htmlFor="ln-n">Note</Label><Input id="ln-n" name="note" /></div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={pending}>{pending ? <><Spinner size="sm" /> Saving…</> : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
