"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Paperclip, X, Banknote } from "lucide-react";
import { decideExpenseRequest, cancelExpenseRequest } from "@/app/actions/expenses";
import { searchExpenseRequests } from "@/app/actions/lists";
import { useServerList } from "@/components/ui/use-server-list";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Dot, Sheet, BusyButton, FormError, money, fmtDate, type Tone } from "@/components/app/shared/kit";
import type { ExpenseRequestRow } from "@/lib/data/expenses";
import type { BudgetUse } from "@/components/app/expenses/expense-form";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for approval", tone: "warning" }, approved: { label: "Approved, not paid yet", tone: "info" },
  paid: { label: "Paid", tone: "success" }, rejected: { label: "Declined", tone: "danger" }, cancelled: { label: "Cancelled", tone: "muted" },
};

export function ApprovalsPanel({ pending, decided, budgets, me, canWrite, onPay }: {
  pending: ExpenseRequestRow[]; decided: { rows: ExpenseRequestRow[]; total: number; page: number }; budgets: BudgetUse[]; me: { id: string; isOwner: boolean }; canWrite: boolean; onPay: (r: ExpenseRequestRow) => void;
}) {
  const [declining, setDeclining] = useState<ExpenseRequestRow | null>(null);

  return (
    <div className="space-y-4">
      {pending.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-ink-muted">No requests waiting.</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.map((r) => <RequestCard key={r.id} r={r} budgets={budgets} me={me} canWrite={canWrite} onPay={() => onPay(r)} onDecline={() => setDeclining(r)} />)}
        </div>
      )}

      <Card className="p-0">
        <div className="border-b border-line px-4 py-3">
          <h3 className="font-display text-[1rem] font-semibold">Decided</h3>
        </div>
        <DecidedList initial={decided} />
      </Card>
      {declining && <DeclineSheet r={declining} onClose={() => setDeclining(null)} />}
    </div>
  );
}

function DecidedList({ initial }: { initial: { rows: ExpenseRequestRow[]; total: number; page: number } }) {
  const list = useServerList<ExpenseRequestRow, { status: string }>({ initial, query: "", filters: { status: "" }, fetchPage: searchExpenseRequests, pageSize: 20 });
  if (!list.rows.length) return <p className="px-4 py-6 text-center text-sm text-ink-faint">Nothing decided yet.</p>;
  return (
    <>
      <ul className="divide-y divide-line-soft">
        {list.rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1"><span className="font-medium">{r.description}</span><span className="block text-xs text-ink-muted">{r.requestedByName ?? "Someone"} · {fmtDate(r.createdAt)}{r.decidedByName ? ` · ${r.status === "rejected" ? "declined" : "decided"} by ${r.decidedByName}` : ""}{r.decisionNote ? `: ${r.decisionNote}` : ""}</span></span>
            <Dot tone={STATUS[r.status]?.tone ?? "muted"}>{STATUS[r.status]?.label ?? r.status}</Dot>
            <span className="w-24 text-right font-semibold tabular-nums">{money(r.amount, true)}</span>
          </li>
        ))}
      </ul>
      {list.pager}
    </>
  );
}

function RequestCard({ r, budgets, me, canWrite, onPay, onDecline }: { r: ExpenseRequestRow; budgets: BudgetUse[]; me: { id: string; isOwner: boolean }; canWrite: boolean; onPay: () => void; onDecline: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [approving, startApprove] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const own = r.requestedById === me.id;
  const mayDecide = canWrite && (!own || me.isOwner);
  const st = STATUS[r.status] ?? STATUS.pending;
  const line = r.budgetItem ? budgets.flatMap((b) => b.items).find((i) => i.id === r.budgetItem!.id) : null;
  const lineLeft = line ? line.amount - line.used : null;

  const approve = () => {
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("decision", "approve");
    startApprove(async () => { const x = await decideExpenseRequest(fd); if (x.ok) { toast("Approved", "success"); router.refresh(); } else toast(x.error ?? "Could not approve.", "error"); });
  };
  const cancel = () => {
    const fd = new FormData();
    fd.set("id", r.id);
    startCancel(async () => { const x = await cancelExpenseRequest(fd); if (x.ok) { toast("Request cancelled", "success"); router.refresh(); } else toast(x.error ?? "Could not cancel.", "error"); });
  };

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">{r.requestedByName ?? "Someone"} · {fmtDate(r.createdAt)}{r.neededBy ? ` · needed by ${fmtDate(r.neededBy, false)}` : ""}</p>
          <p className="mt-0.5 font-medium">{r.description}</p>
          <p className="text-xs text-ink-muted">{[r.category, r.vendorName].filter(Boolean).join(" · ")}</p>
        </div>
        <p className="shrink-0 font-display text-2xl font-bold tabular-nums">{money(r.amount)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Dot tone={st.tone}>{st.label}</Dot>
        {r.budgetItem && <span className="text-xs text-ink-muted">{r.budget?.name}: {r.budgetItem.description}{lineLeft != null && <span className={lineLeft < r.amount ? "text-warning" : ""}>, {lineLeft < r.amount ? `goes ${money(r.amount - lineLeft)} over` : `${money(lineLeft - r.amount)} left after`}</span>}</span>}
        {r.attachmentUrl && <a href={r.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Paperclip className="size-3" /> Attachment</a>}
      </div>
      {r.note && <p className="mt-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-ink-muted">{r.note}</p>}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
        {mayDecide && r.status === "pending" && <BusyButton type="button" size="sm" busy={approving} busyLabel="Approving…" onClick={approve}><Check /> Approve</BusyButton>}
        {canWrite && (r.status === "approved" || (r.status === "pending" && mayDecide)) && <Button size="sm" variant={r.status === "approved" ? "primary" : "secondary"} onClick={onPay}><Banknote /> {r.status === "approved" ? "Pay" : "Approve and pay"}</Button>}
        {mayDecide && r.status === "pending" && <Button size="sm" variant="ghost" onClick={onDecline}><X /> Decline</Button>}
        {own && !canWrite && <BusyButton type="button" size="sm" variant="ghost" busy={cancelling} busyLabel="Cancelling…" onClick={cancel}>Cancel request</BusyButton>}
        {own && canWrite && !me.isOwner && r.status === "pending" && <span className="text-xs text-ink-faint">Someone else has to approve your own request.</span>}
      </div>
    </Card>
  );
}

function DeclineSheet({ r, onClose }: { r: ExpenseRequestRow; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const submit = (fd: FormData) => {
    setError("");
    fd.set("id", r.id);
    fd.set("decision", "reject");
    start(async () => {
      const x = await decideExpenseRequest(fd);
      if (x.ok) { toast("Declined", "success"); router.refresh(); onClose(); } else setError(x.error ?? "That did not save.");
    });
  };
  return (
    <Sheet open onClose={onClose} busy={pending} title="Decline request" description={`${money(r.amount)} for ${r.description}`}>
      <form action={submit} className="space-y-4">
        <Textarea name="note" required rows={3} placeholder="Tell them why, so they know what to do next" />
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} variant="danger" className="flex-1">Decline</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
