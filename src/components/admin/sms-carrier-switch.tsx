"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setAllChurchesSmsCarrier } from "@/app/actions/admin";

/** Moves every church to one carrier at once, for the day Hubtel or Nalo becomes the only one. */
export function SmsCarrierSwitch({ hubtel, nalo, naloReady }: { hubtel: number; nalo: number; naloReady: boolean }) {
  const [pending, start] = useTransition();
  const [working, setWorking] = useState<"hubtel" | "nalo" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const moveAll = (carrier: "hubtel" | "nalo") => {
    const name = carrier === "nalo" ? "Nalo" : "Hubtel";
    if (!confirm(`Send texts from EVERY church through ${name}? Churches whose sender name is approved on the other carrier will send under the WorshipHQ sender, with their church name on the first line.`)) return;
    setWorking(carrier);
    setNote(null);
    start(async () => {
      const res = await setAllChurchesSmsCarrier(carrier);
      setNote(res.ok ? `All ${res.count} churches now send through ${name}.` : res.error);
      setWorking(null);
    });
  };

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50";
  return (
    <section className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-slate-100">SMS carrier</h2>
      <p className="mt-1 text-xs text-slate-400">
        Hubtel: {hubtel} {hubtel === 1 ? "church" : "churches"}. Nalo: {nalo} {nalo === 1 ? "church" : "churches"}. Change one church from its row on the Churches page. Numbers outside Ghana always use Nalo.
      </p>
      {!naloReady && <p className="mt-2 text-xs text-amber-300">Nalo is not set up on this server yet, so churches set to Nalo keep using Hubtel.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => moveAll("nalo")} className={btn}>
          {working === "nalo" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {working === "nalo" ? "Moving churches..." : "Move all churches to Nalo"}
        </button>
        <button type="button" disabled={pending} onClick={() => moveAll("hubtel")} className={btn}>
          {working === "hubtel" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {working === "hubtel" ? "Moving churches..." : "Move all churches to Hubtel"}
        </button>
        {note && <span className="text-xs text-slate-300">{note}</span>}
      </div>
    </section>
  );
}
