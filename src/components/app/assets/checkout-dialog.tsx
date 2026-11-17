"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkOutAsset, checkInAsset } from "@/app/actions/assets";
import { searchPickerPeople } from "@/app/actions/lists";
import { SearchSelect } from "@/components/app/search-select";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Sheet, BusyButton, FormError, F, ChipChoice } from "@/components/app/shared/kit";
import { ASSET_CONDITIONS } from "@/lib/assets/categories";

const conditions = ASSET_CONDITIONS.filter((c) => c.key !== "decommissioned").map((c) => ({ value: c.key, label: c.label }));

export function CheckoutDialog({ assetId, name, condition, onClose }: { assetId: string; name: string; condition: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [person, setPerson] = useState("");
  const [cond, setCond] = useState(condition === "decommissioned" ? "good" : condition);

  const submit = (fd: FormData) => {
    setError("");
    fd.set("assetId", assetId);
    fd.set("personId", person);
    fd.set("conditionOut", cond);
    start(async () => {
      const r = await checkOutAsset(fd);
      if (r.ok) { toast(`${name} is out`, "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} title={`Lend out ${name}`}>
      <form action={submit} className="space-y-4">
        <F label="To a member">
          <SearchSelect value={person} onChange={(v) => setPerson(v)} options={[{ value: "", label: "Someone not in the list" }]} placeholder="Search for a person…" search={(q) => searchPickerPeople("assets", q, { who: "notInactive" })} />
        </F>
        {!person && (
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Their name" htmlFor="co-n"><Input id="co-n" name="borrowerName" placeholder="Full name" /></F>
            <F label="Phone" htmlFor="co-p"><Input id="co-p" name="borrowerPhone" type="tel" inputMode="tel" placeholder="024 000 0000" /></F>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="What for" htmlFor="co-pu"><Input id="co-pu" name="purpose" placeholder="e.g. Youth camp" /></F>
          <F label="Due back" htmlFor="co-d"><Input id="co-d" name="dueAt" type="date" /></F>
        </div>
        <F label="Condition as it goes out"><ChipChoice value={cond} onChange={setCond} options={conditions} /></F>
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Lend out</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}

export function ReturnDialog({ assetId, name, borrower, onClose }: { assetId: string; name: string; borrower: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [cond, setCond] = useState("good");

  const submit = (fd: FormData) => {
    setError("");
    fd.set("assetId", assetId);
    fd.set("conditionIn", cond);
    start(async () => {
      const r = await checkInAsset(fd);
      if (r.ok) { toast(`${name} is back`, "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not save.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} title="Mark returned" description={`${name}, from ${borrower}`}>
      <form action={submit} className="space-y-4">
        <F label="Condition on return"><ChipChoice value={cond} onChange={setCond} options={conditions} /></F>
        <F label="Note" htmlFor="ci-n"><Textarea id="ci-n" name="note" rows={2} className="min-h-16" placeholder="Anything broken or missing?" /></F>
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} className="flex-1">Mark returned</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
