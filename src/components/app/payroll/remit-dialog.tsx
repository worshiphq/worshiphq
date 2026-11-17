"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { markPostingPaidOver } from "@/app/actions/payroll";
import { BusyButton } from "./busy-button";
import { ghs, field } from "./ui";

/** "Mark as paid over" for SSNIT, PAYE or deductions: records the expense with its date and reference. */
export function RemitDialog({ posting, accounts, defaultAccountId, onClose }: {
  posting: { id: string; label: string; amount: number }; accounts: { id: string; name: string }[]; defaultAccountId: string | null; onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  return (
    <Modal open onClose={onClose} title="Mark as paid over" description={posting.label}>
      <div className="space-y-4">
        <div className="rounded-xl bg-primary/5 p-4 text-center"><div className="text-xs text-ink-faint">Amount</div><div className="font-display text-2xl font-bold tabular-nums">{ghs(posting.amount)}</div></div>
        <div>
          <Label htmlFor="rm-acc">Paid from</Label>
          <select id="rm-acc" className={field} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">No account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="rm-d">Date paid</Label><Input id="rm-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label htmlFor="rm-r">Reference</Label><Input id="rm-r" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or transfer number" /></div>
        </div>
        <BusyButton className="w-full" pendingLabel="Recording…" run={() => markPostingPaidOver(posting.id, { accountId, date, reference })} onDone={(r) => r.ok && onClose()}>Record as paid over</BusyButton>
      </div>
    </Modal>
  );
}
