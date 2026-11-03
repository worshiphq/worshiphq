"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, ShieldCheck, AlertTriangle, PackagePlus } from "lucide-react";
import { addSmsPurchase, deleteSmsPurchase } from "@/app/actions/sms-stock";

type Row = { id: string; credits: number; costGhs: number; provider: string | null; note: string | null; purchasedAt: string };
export type StockView = {
  ready: boolean; bought: number; spentGhs: number; sent: number; held: number; promised: number; cushion: number;
  level: "ok" | "low" | "over" | "none"; purchases: Row[];
};

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const cedi = (x: number) => `₵${x.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";

/** "Are we safe on SMS?" and the owner's purchase ledger. Anyone with SuperAdmin can read it; only the owner can add or delete. */
export function SmsStockCard({ stock, assumedCost, isOwner }: { stock: StockView; assumedCost: number; isOwner: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState("Hubtel");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const tone = { ok: "text-emerald-300", low: "text-amber-300", over: "text-rose-300", none: "text-slate-300" }[stock.level];
  const headline = {
    ok: "Safe: you hold more SMS than churches can still send.",
    low: "Getting tight: your cushion is under 15% of what churches hold. Buy more soon.",
    over: "Oversold: churches hold more credits than you have SMS for. Buy more now.",
    none: "Enter what you have bought to see whether you are safe.",
  }[stock.level];

  const add = () => {
    setMsg(null);
    start(async () => {
      try {
        const r = await addSmsPurchase({ amountGhs: Number(amount.replace(/,/g, "")), provider, note });
        if (r.ok) { setAmount(""); setNote(""); setMsg({ ok: true, text: `Saved: about ${n(r.credits)} SMS.` }); router.refresh(); }
        else setMsg({ ok: false, text: r.error });
      } catch (e) { setMsg({ ok: false, text: (e as Error).message || "That did not work." }); }
    });
  };
  const remove = (id: string) => {
    if (!confirm("Delete this purchase?")) return;
    setBusyId(id);
    start(async () => { try { await deleteSmsPurchase(id); router.refresh(); } finally { setBusyId(null); } });
  };

  const rows: [string, string, string?][] = [
    ["You topped up", cedi(stock.spentGhs), `about ${n(stock.bought)} SMS at ₵${assumedCost.toFixed(4)} each`],
    ["Churches have sent", `- ${n(stock.sent)}`],
    ["You still hold", `${n(stock.held)} SMS`, `about ${cedi(stock.held * assumedCost)} on Hubtel`],
    ["Churches still hold (promised)", `- ${n(stock.promised)}`],
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        {stock.level === "ok" ? <ShieldCheck className="size-4 text-emerald-300" /> : <AlertTriangle className={`size-4 ${tone}`} />} Are we safe on SMS?
      </div>

      {!stock.ready ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">The purchases table has not been created yet. Run <b>sql/sms-purchases.sql</b> in Supabase, then come back.</p>
      ) : (
        <>
          <p className={`text-sm font-medium ${tone}`}>{headline}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            {rows.map(([k, v, sub]) => (
              <div key={k} className="flex justify-between"><dt className="text-slate-400">{k}</dt><dd className="text-slate-200">{v}{sub && <span className="ml-2 text-xs text-slate-500">{sub}</span>}</dd></div>
            ))}
            <div className="flex justify-between border-t border-white/10 pt-2">
              <dt className="font-medium text-slate-200">Cushion</dt>
              <dd className={`font-bold ${tone}`}>{stock.cushion < 0 ? "-" : ""}{n(Math.abs(stock.cushion))} SMS</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Not counted: your own sign-in codes and alerts, and anything HostHub sends on the same Hubtel account. They use stock too, so the real
            cushion is a little smaller. Compare it with the balance Hubtel shows now and then.
          </p>
        </>
      )}

      {isOwner && stock.ready && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300"><PackagePlus className="size-3.5" /> I topped up SMS</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <input className={field} inputMode="decimal" placeholder="Amount you paid (GHS)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
              {Number(amount.replace(/,/g, "")) > 0 && assumedCost > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">About {n(Math.floor(Number(amount.replace(/,/g, "")) / assumedCost))} SMS at ₵{assumedCost.toFixed(4)} each</p>
              )}
            </div>
            <input className={field} placeholder="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
            <input className={`${field} sm:col-span-2`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button onClick={add} disabled={pending || !amount} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50">
            {pending && !busyId ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Add top-up"}
          </button>
          {msg && <span className={`ml-3 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</span>}
        </div>
      )}

      {stock.purchases.length > 0 && (
        <ul className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 text-sm">
          {stock.purchases.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-20 shrink-0 text-xs text-slate-500">{new Date(p.purchasedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">{cedi(p.costGhs)} · about {n(p.credits)} SMS{p.provider && <span className="text-slate-500"> · {p.provider}</span>}{p.note && <span className="text-slate-500"> · {p.note}</span>}</span>
              {isOwner && (
                <button onClick={() => remove(p.id)} disabled={pending} className="shrink-0 rounded p-1 text-slate-500 hover:text-rose-300">
                  {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
