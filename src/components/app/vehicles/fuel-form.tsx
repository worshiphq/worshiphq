"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logFuel } from "@/app/actions/vehicles";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { ReceiptInput } from "@/components/app/expenses/receipt-input";
import { Sheet, BusyButton, FormError, F, Select, ChipChoice, money, todayYmd } from "@/components/app/shared/kit";
import { Plate } from "@/components/app/vehicles/plate";
import { PostCostBox, type Account } from "@/components/app/vehicles/service-form";
import { PAYMENT_METHODS } from "@/lib/assets/categories";

export function FuelSheet({ vehicles, vehicleId, accounts, canPostExpenses, onClose }: {
  vehicles: { id: string; regNumber: string; odometerKm: number; active: boolean }[];
  vehicleId?: string;
  accounts: Account[];
  canPostExpenses: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const list = vehicles.filter((v) => v.active);
  const [vid, setVid] = useState(vehicleId ?? list[0]?.id ?? "");
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [method, setMethod] = useState("cash");
  const [record, setRecord] = useState(true);
  const v = vehicles.find((x) => x.id === vid);
  const ppl = Number(litres) > 0 && Number(cost) > 0 ? Number(cost) / Number(litres) : null;

  const submit = (fd: FormData) => {
    setError("");
    fd.set("vehicleId", vid);
    fd.set("paymentMethod", method);
    if (!record) fd.delete("record");
    start(async () => {
      const r = await logFuel(fd);
      if (r.ok) {
        toast(r.posted === "expense" ? "Fuel saved and recorded in Expenses" : r.posted === "request" ? "Fuel saved and sent to finance" : "Fuel saved", "success");
        router.refresh();
        onClose();
      } else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} title="Log fuel">
      <form action={submit} className="space-y-4">
        {!vehicleId && list.length > 1 ? (
          <F label="Vehicle" htmlFor="f-v"><Select id="f-v" value={vid} onChange={setVid} options={list.map((x) => ({ value: x.id, label: x.regNumber }))} /></F>
        ) : v ? <Plate reg={v.regNumber} /> : null}
        <div className="grid grid-cols-2 gap-3">
          <F label="Litres" htmlFor="f-l"><Input id="f-l" name="litres" type="number" inputMode="decimal" min="0" step="0.01" value={litres} onChange={(e) => setLitres(e.target.value)} required className="text-lg tabular-nums" /></F>
          <F label="Cost (₵)" htmlFor="f-c" hint={ppl ? `${money(ppl, true)} a litre` : undefined}><Input id="f-c" name="cost" type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required className="text-lg tabular-nums" /></F>
          <F label="Odometer (km)" htmlFor="f-o"><Input id="f-o" name="odometer" type="number" inputMode="numeric" min={v?.odometerKm ?? 0} placeholder={v ? String(v.odometerKm) : ""} /></F>
          <F label="Date" htmlFor="f-d"><Input id="f-d" name="date" type="date" defaultValue={todayYmd()} /></F>
        </div>
        <F label="Station" htmlFor="f-s"><Input id="f-s" name="station" placeholder="e.g. GOIL Kaneshie" /></F>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="fullTank" value="1" defaultChecked className="size-4 accent-[var(--color-primary)]" /> Filled the tank (used to work out km per litre)</label>
        <input type="hidden" name="fullTank" value="" />
        <F label="Paid by"><ChipChoice value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label }))} /></F>
        <ReceiptInput />
        <PostCostBox canPostExpenses={canPostExpenses} accounts={accounts} checked={record} onChange={setRecord} hideMethod />
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Save fuel</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
