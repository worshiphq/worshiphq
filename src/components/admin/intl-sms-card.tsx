"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2 } from "lucide-react";
import { SMS_RATE, foreignCreditsPerSegment, ghsToUsd } from "@/config/sms";
import { saveIntlSmsPricing } from "@/app/actions/sms-stock";

const field = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";

/**
 * International SMS prices. `price` is what a church pays per segment to a number outside Ghana; `cost` is what Nalo
 * charges WorshipHQ. Everything else (45 / 50 / 57 credits, the dollar price) follows from these two.
 */
export function IntlSmsCard({ initial, usdRate, isOwner }: { initial: { priceGhs: number; costGhs: number }; usdRate: number; isOwner: boolean }) {
  const router = useRouter();
  const [price, setPrice] = useState(String(initial.priceGhs));
  const [cost, setCost] = useState(String(initial.costGhs));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  const profit = p - c;

  const save = () => {
    setMsg(null);
    start(async () => {
      try {
        const r = await saveIntlSmsPricing({ priceGhs: p, costGhs: c });
        if (r.ok) { setMsg({ ok: true, text: "International SMS prices saved." }); router.refresh(); }
        else setMsg({ ok: false, text: r.error });
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message || "That did not work." });
      }
    });
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200"><Globe2 className="size-4 text-teal-300" /> International SMS (numbers outside Ghana)</div>
      <p className="mb-4 text-xs text-slate-400">
        Churches outside Ghana buy credits at this price each, shown to them in dollars. Ghana churches pay the same price in their own credits for each text to a number outside Ghana.
        Your own texts (sign-in codes, notices) are never sent abroad: those go by email.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-medium text-slate-300">Churches pay per SMS (GHS)
          <input className={`${field} mt-1`} inputMode="decimal" value={price} disabled={!isOwner} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <label className="text-xs font-medium text-slate-300">Nalo charges you per SMS (GHS)
          <input className={`${field} mt-1`} inputMode="decimal" value={cost} disabled={!isOwner} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        {isOwner && (
          <button onClick={save} disabled={pending || p <= 0 || c <= 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50">
            {pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save prices"}
          </button>
        )}
      </div>
      {p > 0 && (
        <dl className="mt-4 grid gap-1.5 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Church outside Ghana sees</dt><dd className="text-slate-200">${ghsToUsd(p, usdRate).toFixed(2)} per credit (at ₵{usdRate} to $1)</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Your profit per SMS</dt><dd className={profit > 0 ? "text-emerald-300" : "text-rose-300"}>₵{profit.toFixed(2)} before Paystack fees</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Ghana church, Standard price</dt><dd className="text-slate-200">{foreignCreditsPerSegment("D", p)} credits per SMS abroad (₵{(foreignCreditsPerSegment("D", p) * SMS_RATE.D).toFixed(2)})</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Ghana church, Reduced price</dt><dd className="text-slate-200">{foreignCreditsPerSegment("C", p)} credits (₵{(foreignCreditsPerSegment("C", p) * SMS_RATE.C).toFixed(2)})</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Ghana church, Lowest price</dt><dd className="text-slate-200">{foreignCreditsPerSegment("B", p)} credits (₵{(foreignCreditsPerSegment("B", p) * SMS_RATE.B).toFixed(2)})</dd></div>
        </dl>
      )}
      {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
    </div>
  );
}
