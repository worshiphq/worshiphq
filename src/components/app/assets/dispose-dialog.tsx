"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disposeAsset } from "@/app/actions/assets";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Sheet, BusyButton, FormError, F, Select, ChipChoice, money, todayYmd } from "@/components/app/shared/kit";
import { DISPOSAL_METHODS } from "@/lib/assets/categories";

export function DisposeDialog({ assetId, name, bookValue, accounts, onClose }: {
  assetId: string; name: string; bookValue: number; accounts: { id: string; name: string; isDefault: boolean }[]; onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [method, setMethod] = useState("sold");
  const [amount, setAmount] = useState("");
  const got = Number(amount) || 0;
  const diff = Math.round((got - bookValue) * 100) / 100;

  const submit = (fd: FormData) => {
    setError("");
    fd.set("assetId", assetId);
    fd.set("method", method);
    start(async () => {
      const r = await disposeAsset(fd);
      if (r.ok) { toast(`${name} is marked as disposed`, "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} title={`Dispose of ${name}`} description="It stays in the history but leaves the register's value.">
      <form action={submit} className="space-y-4">
        <F label="How it left"><ChipChoice value={method} onChange={setMethod} options={DISPOSAL_METHODS.map((m) => ({ value: m.key, label: m.label }))} /></F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Date" htmlFor="dp-d"><Input id="dp-d" name="date" type="date" defaultValue={todayYmd()} /></F>
          {method === "sold" && <F label="Amount received (₵)" htmlFor="dp-a"><Input id="dp-a" name="amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums" /></F>}
        </div>
        {method === "sold" && got > 0 && (
          <>
            <F label="Paid into" htmlFor="dp-acc"><Select id="dp-acc" name="accountId" defaultValue={accounts.find((a) => a.isDefault)?.id ?? ""} options={[{ value: "", label: "Default account" }, ...accounts.map((a) => ({ value: a.id, label: a.name })), { value: "none", label: "Not banked yet (cash in hand)" }]} /></F>
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm tabular-nums">
              Book value {money(bookValue)}. Sold for {money(got)}: {diff === 0 ? "no gain or loss." : diff > 0 ? <span className="font-medium text-success">a gain of {money(diff)}.</span> : <span className="font-medium text-danger">a loss of {money(-diff)}.</span>}
            </p>
          </>
        )}
        <F label="Note" htmlFor="dp-n"><Textarea id="dp-n" name="note" rows={2} className="min-h-16" placeholder="Who bought it, why it was scrapped…" /></F>
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} variant="danger" className="flex-1">Dispose</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
