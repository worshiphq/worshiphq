"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logMaintenance, saveSchedule } from "@/app/actions/maintenance";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { ReceiptInput } from "@/components/app/expenses/receipt-input";
import { Sheet, BusyButton, FormError, F, Select, ChipChoice, todayYmd, ymdOf } from "@/components/app/shared/kit";
import { PAYMENT_METHODS } from "@/lib/assets/categories";

export type Account = { id: string; name: string; isDefault: boolean };

/** The "Record as a church expense" box. Its wording changes when the person cannot post expenses themselves. */
export function PostCostBox({ canPostExpenses, accounts, checked, onChange, hideMethod }: { canPostExpenses: boolean; accounts: Account[]; checked: boolean; onChange: (v: boolean) => void; hideMethod?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="record" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
        <span>
          <span className="font-medium text-ink">{canPostExpenses ? "Record as a church expense" : "Send to finance for approval"}</span>
          <span className="block text-xs text-ink-muted">{canPostExpenses ? "It shows in Expenses straight away, linked to this item." : "Finance approves and pays it; it then shows in Expenses."}</span>
        </span>
      </label>
      {checked && canPostExpenses && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <F label="Paid from" htmlFor="pc-acc"><Select id="pc-acc" name="accountId" defaultValue={accounts.find((a) => a.isDefault)?.id ?? ""} options={[{ value: "", label: "Default account" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} /></F>
          {!hideMethod && <F label="Paid how" htmlFor="pc-pm"><Select id="pc-pm" name="paymentMethod" defaultValue="cash" options={PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label }))} /></F>}
        </div>
      )}
    </div>
  );
}

export function LogServiceSheet({ assetId, isVehicle, odometerKm, schedules, scheduleId, accounts, canPostExpenses, defaultKind = "service", onClose }: {
  assetId: string;
  isVehicle: boolean;
  odometerKm?: number;
  schedules: { id: string; title: string }[];
  scheduleId?: string | null;
  accounts: Account[];
  canPostExpenses: boolean;
  defaultKind?: "service" | "repair" | "inspection";
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [kind, setKind] = useState<string>(defaultKind);
  const [sched, setSched] = useState(scheduleId ?? "");
  const [title, setTitle] = useState(schedules.find((s) => s.id === scheduleId)?.title ?? "");
  const [record, setRecord] = useState(true);

  const submit = (fd: FormData) => {
    setError("");
    fd.set("assetId", assetId);
    fd.set("kind", kind);
    fd.set("scheduleId", sched);
    if (!record) fd.delete("record");
    start(async () => {
      const r = await logMaintenance(fd);
      if (r.ok) {
        toast(r.posted === "request" ? "Saved and sent to finance" : r.posted === "expense" ? "Saved and recorded in Expenses" : "Saved", "success");
        router.refresh();
        onClose();
      } else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} title={kind === "repair" ? "Log a repair" : "Log a service"}>
      <form action={submit} className="space-y-4">
        <ChipChoice value={kind} onChange={setKind} options={[{ value: "service", label: "Service" }, { value: "repair", label: "Repair" }, { value: "inspection", label: "Inspection" }]} />
        {schedules.length > 0 && kind === "service" && (
          <F label="Which service" htmlFor="ls-s">
            <Select id="ls-s" value={sched} onChange={(v) => { setSched(v); const s = schedules.find((x) => x.id === v); if (s) setTitle(s.title); }} options={[{ value: "", label: "Not on a schedule" }, ...schedules.map((s) => ({ value: s.id, label: s.title }))]} />
          </F>
        )}
        <F label="What was done" htmlFor="ls-t"><Input id="ls-t" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "repair" ? "e.g. Replaced brake pads" : "e.g. Engine oil and filter"} required /></F>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Date" htmlFor="ls-d"><Input id="ls-d" name="date" type="date" defaultValue={todayYmd()} /></F>
          {isVehicle && <F label="Odometer (km)" htmlFor="ls-km"><Input id="ls-km" name="odometerKm" type="number" inputMode="numeric" min="0" placeholder={odometerKm ? String(odometerKm) : ""} /></F>}
          <F label="Cost (₵)" htmlFor="ls-c"><Input id="ls-c" name="cost" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" className="tabular-nums" /></F>
        </div>
        <F label="Mechanic, artisan or shop" htmlFor="ls-v"><Input id="ls-v" name="vendorName" placeholder="Who did it" /></F>
        <F label="Notes" htmlFor="ls-n"><Textarea id="ls-n" name="notes" rows={2} className="min-h-16" placeholder="Parts used, advice given…" /></F>
        <ReceiptInput />
        <PostCostBox canPostExpenses={canPostExpenses} accounts={accounts} checked={record} onChange={setRecord} />
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Save</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}

export function ScheduleSheet({ assetId, isVehicle, odometerKm, schedule, onClose }: {
  assetId: string;
  isVehicle: boolean;
  odometerKm?: number;
  schedule?: { id: string; title: string; everyDays: number | null; everyKm: number | null; lastDoneAt: string | null } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const submit = (fd: FormData) => {
    setError("");
    fd.set("assetId", assetId);
    if (schedule) fd.set("id", schedule.id);
    start(async () => {
      const r = await saveSchedule(fd);
      if (r.ok) { toast("Schedule saved", "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not save.");
    });
  };

  const months = schedule?.everyDays ? Math.round(schedule.everyDays / 30) : "";
  return (
    <Sheet open onClose={onClose} busy={pending} title={schedule ? "Edit schedule" : "Add a service schedule"} description={isVehicle ? "For example engine oil every 5,000 km or 6 months, whichever comes first." : "For example servicing the generator every 3 months."}>
      <form action={submit} className="space-y-4">
        <F label="What" htmlFor="sc-t"><Input id="sc-t" name="title" defaultValue={schedule?.title} placeholder={isVehicle ? "Engine oil" : "Generator service"} required /></F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Every (months)" htmlFor="sc-m"><Input id="sc-m" name="everyMonths" type="number" min="0" inputMode="numeric" defaultValue={months} placeholder="e.g. 6" /></F>
          {isVehicle && <F label="Or every (km)" htmlFor="sc-k"><Input id="sc-k" name="everyKm" type="number" min="0" inputMode="numeric" defaultValue={schedule?.everyKm ?? ""} placeholder="e.g. 5000" /></F>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Last done on" htmlFor="sc-ld" hint="Leave empty to start counting from today"><Input id="sc-ld" name="lastDoneAt" type="date" defaultValue={ymdOf(schedule?.lastDoneAt)} /></F>
          {isVehicle && <F label="At (km)" htmlFor="sc-lk"><Input id="sc-lk" name="lastDoneKm" type="number" min="0" inputMode="numeric" placeholder={odometerKm ? String(odometerKm) : ""} /></F>}
        </div>
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Save schedule</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
