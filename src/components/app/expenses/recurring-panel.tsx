"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { saveRecurringExpense, recordRecurringNow, pauseRecurringExpense, deleteRecurringExpense } from "@/app/actions/expenses";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { Dot, Sheet, BusyButton, FormError, F, Select, money, fmtDate, todayYmd, ymdOf } from "@/components/app/shared/kit";
import { FREQUENCIES, frequencyLabel } from "@/lib/expenses/recurrence";
import { PAYMENT_METHODS } from "@/lib/assets/categories";
import { daysUntil } from "@/lib/fleet/due";
import type { FormLists } from "@/components/app/expenses/expense-form";

export type Recurring = {
  id: string; description: string; amount: number; category: string; vendorName: string | null; vendorId: string | null; accountId: string | null;
  paymentMethod: string | null; frequency: string; nextDue: string; endsAt: string | null; active: boolean; budgetItemId: string | null; fundId: string | null;
};

export function RecurringPanel({ items, lists, canWrite, canDelete }: { items: Recurring[]; lists: FormLists; canWrite: boolean; canDelete: boolean }) {
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  return (
    <div className="space-y-3">
      {canWrite && <div className="flex justify-end"><Button size="sm" onClick={() => setEditing("new")}><Plus /> Add a regular payment</Button></div>}
      {items.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-ink-muted">
          <Repeat className="mx-auto mb-2 size-7 text-ink-faint" />
          Rent, electricity, a caretaker&apos;s pay: add the bills that come round every month and record each one with a tap.
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {items.map((r) => <Row key={r.id} r={r} canWrite={canWrite} canDelete={canDelete} onEdit={() => setEditing(r)} />)}
          </ul>
        </Card>
      )}
      {editing && <RecurringForm value={editing === "new" ? null : editing} lists={lists} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Row({ r, canWrite, canDelete, onEdit }: { r: Recurring; canWrite: boolean; canDelete: boolean; onEdit: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [recording, startRecord] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [removing, startRemove] = useTransition();
  const d = daysUntil(r.nextDue);
  const fd = () => { const f = new FormData(); f.set("id", r.id); return f; };
  const record = () => startRecord(async () => { const x = await recordRecurringNow(fd()); if (x.ok) { toast(`${r.description} recorded`, "success"); router.refresh(); } else toast(x.error ?? "Could not record.", "error"); });
  const toggle = () => { const f = fd(); if (!r.active) f.set("active", "1"); startToggle(async () => { const x = await pauseRecurringExpense(f); if (x.ok) router.refresh(); else toast(x.error ?? "Could not change it.", "error"); }); };
  const remove = () => { if (!confirmBinDelete(`Remove ${r.description}?`)) return; startRemove(async () => { const x = await deleteRecurringExpense(fd()); if (x.ok) { binDeleted(); router.refresh(); } else toast(x.error ?? "Could not remove.", "error"); }); };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{r.description}</span>
        <span className="block text-xs text-ink-muted">{frequencyLabel(r.frequency)}{r.vendorName ? ` · ${r.vendorName}` : ""} · {r.category}</span>
      </span>
      {r.active ? <Dot tone={d < 0 ? "danger" : d <= 7 ? "warning" : "muted"}>{d < 0 ? `Was due ${fmtDate(r.nextDue, false)}` : d === 0 ? "Due today" : `Next ${fmtDate(r.nextDue, false)}`}</Dot> : <Dot tone="muted">Paused</Dot>}
      <span className="w-24 text-right font-semibold tabular-nums">{money(r.amount)}</span>
      {canWrite && (
        <span className="flex items-center gap-1">
          {r.active && <BusyButton type="button" size="sm" variant={d <= 0 ? "primary" : "secondary"} busy={recording} busyLabel="Recording…" onClick={record}>Record now</BusyButton>}
          <BusyButton type="button" size="sm" variant="ghost" busy={toggling} busyLabel="…" onClick={toggle}>{r.active ? "Pause" : "Resume"}</BusyButton>
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
          {canDelete && <BusyButton type="button" size="sm" variant="ghost" busy={removing} busyLabel="…" onClick={remove} aria-label="Remove"><Trash2 /></BusyButton>}
        </span>
      )}
    </li>
  );
}

function RecurringForm({ value, lists, onClose }: { value: Recurring | null; lists: FormLists; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const submit = (fd: FormData) => {
    setError("");
    if (value) fd.set("id", value.id);
    const v = lists.vendors.find((x) => x.id === fd.get("vendorId"));
    if (v) fd.set("vendor", v.name);
    start(async () => {
      const r = await saveRecurringExpense(fd);
      if (r.ok) { toast("Saved", "success"); router.refresh(); onClose(); } else setError(r.error ?? "That did not save.");
    });
  };
  const items = lists.budgets.flatMap((b) => b.items.map((i) => ({ value: i.id, label: `${b.name}: ${i.description}` })));
  return (
    <Sheet open onClose={onClose} busy={pending} title={value ? "Edit regular payment" : "Add a regular payment"}>
      <form action={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Amount (₵)" htmlFor="rf-a"><Input id="rf-a" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={value?.amount ?? ""} className="text-lg tabular-nums" /></F>
          <F label="How often" htmlFor="rf-f"><Select id="rf-f" name="frequency" defaultValue={value?.frequency ?? "monthly"} options={FREQUENCIES.map((f) => ({ value: f.key, label: f.label }))} /></F>
        </div>
        <F label="What for" htmlFor="rf-d"><Input id="rf-d" name="description" required defaultValue={value?.description ?? ""} placeholder="e.g. Rent for the church hall" /></F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Category" htmlFor="rf-c"><Input id="rf-c" name="category" list="rf-cats" defaultValue={value?.category ?? ""} placeholder="e.g. Rent" /><datalist id="rf-cats">{lists.categories.map((c) => <option key={c} value={c} />)}</datalist></F>
          <F label="Payee" htmlFor="rf-v"><Select id="rf-v" name="vendorId" defaultValue={value?.vendorId ?? ""} options={[{ value: "", label: "No payee" }, ...lists.vendors.map((v) => ({ value: v.id, label: v.name }))]} /></F>
          {lists.accounts.length > 0 && <F label="Paid from" htmlFor="rf-acc"><Select id="rf-acc" name="accountId" defaultValue={value?.accountId ?? lists.accounts.find((a) => a.isDefault)?.id ?? ""} options={[{ value: "", label: "No account" }, ...lists.accounts.map((a) => ({ value: a.id, label: a.name }))]} /></F>}
          <F label="Paid how" htmlFor="rf-pm"><Select id="rf-pm" name="paymentMethod" defaultValue={value?.paymentMethod ?? "bank"} options={PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label }))} /></F>
          <F label="Next due" htmlFor="rf-n" hint="Monthly payments come back to this day of the month"><Input id="rf-n" name="nextDue" type="date" required defaultValue={value ? ymdOf(value.nextDue) : todayYmd()} /></F>
          <F label="Ends (optional)" htmlFor="rf-e"><Input id="rf-e" name="endsAt" type="date" defaultValue={ymdOf(value?.endsAt)} /></F>
        </div>
        {lists.budgetsOn && items.length > 0 && <F label="Budget line" htmlFor="rf-b"><Select id="rf-b" name="budgetItemId" defaultValue={value?.budgetItemId ?? ""} options={[{ value: "", label: "No budget" }, ...items]} /></F>}
        {lists.fundAccounting && lists.funds.length > 0 && <F label="Fund" htmlFor="rf-fund"><Select id="rf-fund" name="fundId" defaultValue={value?.fundId ?? ""} options={[{ value: "", label: "No fund" }, ...lists.funds.map((f) => ({ value: f.id, label: f.name }))]} /></F>}
        {value && <input type="hidden" name="active" value={value.active ? "1" : ""} />}
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Save</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
