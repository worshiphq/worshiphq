"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, ShieldCheck, AlertTriangle, PackagePlus, Gauge } from "lucide-react";
import { addSmsPurchase, deleteSmsPurchase, saveNaloCost } from "@/app/actions/sms-stock";

type Row = { id: string; kind: string; credits: number; costGhs: number; provider: string | null; note: string | null; purchasedAt: string };
export type StockView = {
  ready: boolean; entries: Row[]; reading: { amountGhs: number; at: string } | null; costPerCredit: number;
  heldGhs: number; held: number; sentSince: number; ownSpentGhs: number; toppedUpSince: number; committed: number; freeTrial: number;
  cushion: number; worstCushion: number; level: "ok" | "low" | "over" | "none";
};

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const cedi = (x: number) => `₵${x.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";
const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** "Are we safe on {carrier}?" Anyone with SuperAdmin can read it; only the owner can add or delete. */
export function SmsStockCard({ stock, isOwner, carrier = "Hubtel" }: { stock: StockView; isOwner: boolean; carrier?: "Hubtel" | "Nalo" }) {
  const [price, setPrice] = useState(String(stock.costPerCredit));
  const router = useRouter();
  const [reading, setReading] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const cost = stock.costPerCredit;

  const tone = { ok: "text-emerald-300", low: "text-amber-300", over: "text-rose-300", none: "text-slate-300" }[stock.level];
  const headline = {
    ok: "Safe: you hold more SMS than churches can send of what they bought or were gifted.",
    low: "Getting tight: your cushion is under 15% of what churches bought or were gifted. Top up soon.",
    over: "Short: churches hold more bought or gifted credits than your provider balance can send. Top up now.",
    none: `Enter what ${carrier} shows to see whether you are safe.`,
  }[stock.level];
  const stale = stock.reading ? days(stock.reading.at) : null;

  const run = (key: string, fn: () => Promise<{ ok: boolean; error?: string; credits?: number }>, okText: (c?: number) => string, reset: () => void) => {
    setMsg(null);
    setBusy(key);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) { reset(); setMsg({ ok: true, text: okText(r.credits) }); router.refresh(); }
        else setMsg({ ok: false, text: r.error ?? "That did not work." });
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message || "That did not work." });
      } finally {
        setBusy(null);
      }
    });
  };
  const saveReading = () =>
    run("reading", () => addSmsPurchase({ amountGhs: Number(reading.replace(/,/g, "")), kind: "balance", provider: carrier }), (c) => `Saved: about ${n(c ?? 0)} SMS left.`, () => setReading(""));
  const saveTopup = () =>
    run("topup", () => addSmsPurchase({ amountGhs: Number(amount.replace(/,/g, "")), kind: "topup", provider: carrier, note }), (c) => `Saved: about ${n(c ?? 0)} SMS.`, () => { setAmount(""); setNote(""); });
  const remove = (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setBusy(id);
    start(async () => {
      try { await deleteSmsPurchase(id); router.refresh(); } finally { setBusy(null); }
    });
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        {stock.level === "ok" ? <ShieldCheck className="size-4 text-emerald-300" /> : <AlertTriangle className={`size-4 ${tone}`} />} Are we safe on SMS?
      </div>

      {!stock.ready ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
          The SMS tables are not set up yet. Run <b>sql/sms-purchases.sql</b> and <b>sql/sms-balance-readings.sql</b> in Supabase, then come back.
        </p>
      ) : (
        <>
          <p className={`text-sm font-medium ${tone}`}>{headline}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            {stock.reading && (
              <div className="flex justify-between">
                <dt className="text-slate-400">{carrier} showed ({new Date(stock.reading.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</dt>
                <dd className="text-slate-200">{cedi(stock.reading.amountGhs)}</dd>
              </div>
            )}
            {stock.toppedUpSince > 0 && (
              <div className="flex justify-between"><dt className="text-slate-400">Topped up since</dt><dd className="text-slate-200">+ {cedi(stock.toppedUpSince)}</dd></div>
            )}
            {stock.sentSince > 0 && (
              <div className="flex justify-between"><dt className="text-slate-400">Churches sent since ({n(stock.sentSince)} SMS)</dt><dd className="text-slate-200">- {cedi(stock.sentSince * cost)}</dd></div>
            )}
            {stock.ownSpentGhs > 0 && (
              <div className="flex justify-between"><dt className="text-slate-400">WorshipHQ&apos;s own texts since (codes, alerts)</dt><dd className="text-slate-200">- {cedi(stock.ownSpentGhs)}</dd></div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-2">
              <dt className="font-medium text-slate-200">You should hold now</dt>
              <dd className="font-semibold text-slate-100">{cedi(stock.heldGhs)} <span className="text-xs font-normal text-slate-500">about {n(stock.held)} SMS</span></dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-400">Churches hold, bought or gifted</dt><dd className="text-slate-200">- {n(stock.committed)} SMS</dd></div>
            <div className="flex justify-between border-t border-white/10 pt-2">
              <dt className="font-medium text-slate-200">Cushion</dt>
              <dd className={`font-bold ${tone}`}>
                {stock.cushion < 0 ? "-" : ""}{n(Math.abs(stock.cushion))} SMS <span className="text-xs font-normal text-slate-500">{cedi(Math.abs(stock.cushion) * cost)}</span>
              </dd>
            </div>
            <div className="flex justify-between text-xs">
              <dt className="text-slate-500">Plus {n(stock.freeTrial)} free signup credits that churches also hold</dt>
              <dd className={stock.worstCushion < 0 ? "text-amber-300" : "text-slate-300"}>worst case {stock.worstCushion < 0 ? "-" : ""}{n(Math.abs(stock.worstCushion))}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            The free signup credits (30 per church) were never bought, and most are never used, so the cushion above leaves them out; the worst case is if every
            church spent all of them. {carrier === "Hubtel" ? "Your own sign-in codes and alerts, and HostHub on the same account, also use balance," : "Texts to numbers outside Ghana and any of your own texts sent this way also use balance,"} so enter a fresh reading now and then.
            {stale !== null && stale >= 7 && <span className="text-amber-300"> Your last reading is {stale} days old.</span>}
          </p>
        </>
      )}

      {isOwner && stock.ready && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Gauge className="size-3.5" /> What does {carrier} show now?</div>
            <div className="flex flex-wrap gap-2">
              <input className={`${field} max-w-[220px]`} inputMode="decimal" placeholder={`${carrier} balance (GHS)`} value={reading} onChange={(e) => setReading(e.target.value.replace(/[^\d.,]/g, ""))} />
              <button onClick={saveReading} disabled={pending || reading === ""} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50">
                {pending && busy === "reading" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save reading"}
              </button>
            </div>
            {Number(reading.replace(/,/g, "")) > 0 && cost > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">About {n(Math.floor(Number(reading.replace(/,/g, "")) / cost))} SMS at ₵{cost.toFixed(4)} each</p>
            )}
          </div>
          {carrier === "Nalo" && (
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-300">Nalo price per SMS</div>
              <div className="flex flex-wrap gap-2">
                <input className={`${field} max-w-[220px]`} inputMode="decimal" aria-label="Nalo price per SMS in cedis" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
                <button onClick={() => run("price", () => saveNaloCost(Number(price)), () => "Nalo price saved.", () => {})} disabled={pending || !Number(price)} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {pending && busy === "price" ? <><Loader2 className="size-4 animate-spin" /> Saving...</> : "Save price"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Change this to the reseller rate when it starts. Readings and top-ups already saved keep the SMS count they were worth.</p>
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300"><PackagePlus className="size-3.5" /> I topped up</div>
            <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
              <input className={field} inputMode="decimal" placeholder="Amount paid (GHS)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
              <input className={field} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button onClick={saveTopup} disabled={pending || !amount} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/15 disabled:opacity-50">
                {pending && busy === "topup" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Add top-up"}
              </button>
            </div>
          </div>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
        </div>
      )}

      {stock.entries.length > 0 && (
        <ul className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 text-sm">
          {stock.entries.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-20 shrink-0 text-xs text-slate-500">{new Date(p.purchasedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">
                {p.kind === "balance" ? <>{carrier} showed {cedi(p.costGhs)}</> : <>Topped up {cedi(p.costGhs)}</>}
                {p.note && <span className="text-slate-500"> · {p.note}</span>}
              </span>
              {isOwner && (
                <button onClick={() => remove(p.id)} disabled={pending} className="shrink-0 rounded p-1 text-slate-500 hover:text-rose-300">
                  {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
