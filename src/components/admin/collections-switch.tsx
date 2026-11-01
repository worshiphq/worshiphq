"use client";

import { useState, useTransition } from "react";
import { switchCollectionsProvider } from "@/app/actions/admin";

/**
 * SuperAdmin switch: which gateway receives WorshipHQ's own collections (SMS top-ups and subscriptions). Flipping it
 * takes effect on the next payment, no redeploy. Church giving is unaffected (it uses Paystack subaccounts).
 */
export function CollectionsSwitch({ current, hubtelReady }: { current: "paystack" | "hubtel"; hubtelReady: boolean }) {
  const [provider, setProvider] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const choose = (p: "paystack" | "hubtel") => {
    if (p === provider || pending) return;
    if (p === "hubtel" && !hubtelReady) { setMsg("Add the Hubtel payment keys in the environment first."); return; }
    setMsg(null);
    start(async () => {
      const r = await switchCollectionsProvider(p);
      if (r.ok) { setProvider(p); setMsg(`Collections now go through ${p === "hubtel" ? "Hubtel" : "Paystack"}.`); }
      else setMsg(r.error ?? "Could not switch.");
    });
  };

  const btnClass = (id: "paystack" | "hubtel") =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      provider === id ? "bg-teal-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
    } ${id === "hubtel" && !hubtelReady ? "cursor-not-allowed opacity-50" : ""}`;

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Collections provider</h2>
      <p className="mt-1 text-xs text-slate-400">
        Which gateway receives WorshipHQ&rsquo;s own collections (SMS top-ups and subscriptions). Switch to Hubtel if Paystack has an
        issue. Takes effect on the next payment, no redeploy. Church giving is not affected.
      </p>
      <div className="mt-3 flex max-w-sm gap-2">
        <button type="button" onClick={() => choose("paystack")} disabled={pending} className={btnClass("paystack")}>
          Paystack
        </button>
        <button type="button" onClick={() => choose("hubtel")} disabled={pending || !hubtelReady} className={btnClass("hubtel")}>
          {hubtelReady ? "Hubtel" : "Hubtel (not set up)"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </div>
  );
}
