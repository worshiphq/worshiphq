"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Check, Eye, Download, Receipt } from "lucide-react";
import { recordChurchPlan, setSmsCostPerCredit } from "@/app/actions/admin";
import { useFeedback } from "@/components/ui/feedback";

const field = "h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";
const TERMS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
  { months: 36, label: "3 years" },
  { months: 60, label: "5 years" },
];

/** Put a church on a plan for a stated term and write it into their billing history as a gift or as money you received yourself. */
const gh = (n: number) => `GH₵${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function RecordPlanForm({ churches, prices, rate }: { churches: { id: string; name: string }[]; prices: Record<string, { monthly: number; yearly: number }>; rate: number }) {
  const { toast } = useFeedback();
  const [q, setQ] = useState("");
  const [churchId, setChurchId] = useState("");
  const [plan, setPlan] = useState("starter");
  const [months, setMonths] = useState(12);
  const [mode, setMode] = useState<"paid" | "gift">("paid");
  const [amount, setAmount] = useState("");
  const [paidFull, setPaidFull] = useState(true);
  const [discMode, setDiscMode] = useState<"pct" | "amount" | "price">("amount");
  const [discVal, setDiscVal] = useState("");
  const [done, setDone] = useState<{ church: string; until: string; receipt?: { id: string; number: string; balance: number } } | null>(null);
  const [method, setMethod] = useState("Mobile Money");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [extend, setExtend] = useState(true);
  const [sendReceipt, setSendReceipt] = useState(true);

  const matches = useMemo(() => churches.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8), [churches, q]);
  const chosen = churches.find((c) => c.id === churchId);

  // The standard price of this plan for this term, in cedis, then the discount (typed as a percentage, an amount, or the price they agree).
  const money = useMemo(() => {
    const p = prices[plan];
    const usd = p ? (months >= 12 ? (p.yearly / 12) * months : p.monthly * months) : 0;
    const list = round2(usd * rate);
    const wanted = discMode === "pct" ? (list * Math.min(num(discVal), 100)) / 100 : discMode === "price" ? (discVal.trim() === "" ? 0 : list - num(discVal)) : num(discVal);
    const discount = round2(Math.min(Math.max(wanted, 0), list));
    const agreed = round2(list - discount);
    const received = paidFull ? agreed : round2(Math.min(num(amount), agreed));
    return { list, discount, agreed, received, balance: round2(Math.max(agreed - received, 0)), pct: list > 0 ? round2((discount / list) * 100) : 0 };
  }, [prices, plan, months, rate, discMode, discVal, paidFull, amount]);
  const shown = {
    pct: discMode === "pct" ? discVal : money.discount > 0 ? String(money.pct) : "",
    amount: discMode === "amount" ? discVal : money.discount > 0 ? String(money.discount) : "",
    price: discMode === "price" ? discVal : money.discount > 0 ? String(money.agreed) : "",
  };

  async function save() {
    if (!churchId) { toast("Choose a church first.", "error"); return; }
    setBusy(true);
    if (mode === "paid" && money.received <= 0) { setBusy(false); toast("Enter how much they paid now.", "error"); return; }
    const r = await recordChurchPlan({
      churchId, plan, months, mode, amountGhs: mode === "paid" ? money.received : 0, agreedGhs: mode === "paid" ? money.agreed : undefined, discountGhs: mode === "paid" ? money.discount : undefined,
      method: mode === "paid" ? method : undefined, note, extend, sendReceipt,
    });
    setBusy(false);
    if (r.ok) {
      const until = new Date(r.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      toast(`Done. ${chosen?.name} is on ${plan} until ${until}.`, "success");
      setDone({ church: chosen?.name ?? "", until, receipt: r.receipt });
      setAmount(""); setNote(""); setDiscVal(""); setDiscMode("amount"); setPaidFull(true);
    } else toast(r.error, "error");
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Church</label>
        {chosen ? (
          <div className="flex items-center justify-between rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-2 text-sm text-slate-100">
            {chosen.name}
            <button type="button" onClick={() => { setChurchId(""); setQ(""); }} className="text-xs text-teal-300 hover:underline">Change</button>
          </div>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a church…" className={field} />
            {q.trim() && (
              <ul className="mt-1 divide-y divide-white/5 rounded-lg border border-white/10 bg-slate-900">
                {matches.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">No church matches.</li>}
                {matches.map((c) => (
                  <li key={c.id}><button type="button" onClick={() => setChurchId(c.id)} className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5">{c.name}</button></li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Plan</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={field}>
            <option value="starter" className="bg-slate-800">Starter</option>
            <option value="pro" className="bg-slate-800">Pro</option>
            <option value="max" className="bg-slate-800">Max</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">For how long</label>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={field}>
            {TERMS.map((t) => <option key={t.months} value={t.months} className="bg-slate-800">{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">What happened</label>
        <div className="grid grid-cols-2 gap-2">
          {([["paid", "They paid me directly"], ["gift", "It is a gift (free)"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === k ? "border-teal-400 bg-teal-500/15 text-teal-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "paid" && (
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-400">Discount (optional). Fill in any one, the others work themselves out</span>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rp-pct">Percent off (%)</label><input id="rp-pct" inputMode="decimal" value={shown.pct} onChange={(e) => { setDiscMode("pct"); setDiscVal(e.target.value.replace(/[^\d.]/g, "")); }} placeholder="0" className={field} /></div>
              <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rp-amt">Amount off (GH₵)</label><input id="rp-amt" inputMode="decimal" value={shown.amount} onChange={(e) => { setDiscMode("amount"); setDiscVal(e.target.value.replace(/[^\d.]/g, "")); }} placeholder="0.00" className={field} /></div>
              <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rp-price">Price they pay (GH₵)</label><input id="rp-price" inputMode="decimal" value={shown.price} onChange={(e) => { setDiscMode("price"); setDiscVal(e.target.value.replace(/[^\d.]/g, "")); }} placeholder={money.list ? String(money.list) : "0.00"} className={field} /></div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="rp-recv">Amount received now (GHS)</label>
              <input id="rp-recv" inputMode="decimal" disabled={paidFull} value={paidFull ? String(money.agreed) : amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 4000" className={field} />
              <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={paidFull} onChange={(e) => setPaidFull(e.target.checked)} /> Paid in full</label>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="rp-method">How they paid</label>
              <input id="rp-method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Mobile Money, bank, cash…" className={field} />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
              <span className="text-slate-400">Standard <b className="text-slate-300">{gh(money.list)}</b></span>
              <span className="text-slate-400">Agreed price <b className="text-slate-100">{gh(money.agreed)}</b>{money.discount > 0 && <span className="text-slate-500"> ({gh(money.discount)} off, {money.pct}%)</span>}</span>
              <span className="text-slate-400">Received <b className="text-slate-100">{gh(money.received)}</b></span>
              <span className={money.balance > 0 ? "text-amber-300" : "text-teal-300"}>{money.balance > 0 ? <>Balance <b>{gh(money.balance)}</b></> : "Fully paid"}</span>
            </div>
            {money.balance > 0 && <p className="mt-1.5 text-xs text-slate-500">The plan is switched on for the whole term now. When they pay the balance, press <b>Record balance payment</b> beside this receipt on the Receipts page. It adds the money to Revenue and makes a second receipt that says paid in full.</p>}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={extend} onChange={(e) => setExtend(e.target.checked)} /> <span>Add this time to the church&apos;s plan<span className="block text-xs text-slate-500">Untick it if the church is already on this plan and you only want the payment written down. Their dates will not change.</span></span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={sendReceipt} onChange={(e) => setSendReceipt(e.target.checked)} /> <span>Email the church a PDF receipt<span className="block text-xs text-slate-500">Goes to the church Owner, with your signature. It also shows under Receipts.</span></span></label>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Note (the church sees this in their billing history)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "gift" ? "e.g. Partner church" : "e.g. 3 years paid upfront"} className={field} />
      </div>

      <button onClick={save} disabled={busy || !churchId} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">
        {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Record it</>}
      </button>
      {done && (
        <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-teal-200"><Check className="size-4" /> {done.church} is on the plan until {done.until}.</div>
          {done.receipt ? (
            <>
              <p className="mt-1 text-xs text-slate-300">Receipt {done.receipt.number} is ready to hand over.{done.receipt.balance > 0 ? ` A balance of ${gh(done.receipt.balance)} is still owed. Record it from the Receipts page when they pay.` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`/api/admin/receipts/${done.receipt.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"><Eye className="size-3.5" /> View receipt</a>
                <a href={`/api/admin/receipts/${done.receipt.id}/pdf?download=1`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"><Download className="size-3.5" /> Download PDF</a>
                <Link href="/admin/receipts" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"><Receipt className="size-3.5" /> All receipts</Link>
              </div>
            </>
          ) : mode === "paid" ? <p className="mt-1 text-xs text-slate-300">No receipt was made because this church has no Owner or Admin user to address it to. You can make one by hand on the Receipts page.</p> : null}
        </div>
      )}
      <p className="text-xs text-slate-500">If the church is already on this plan, the time is added to the end of what they have. It shows in their Billing history and here.</p>
    </div>
  );
}

/** The provider price per SMS credit, which the SMS profit figures are worked out from. */
export function SmsCostForm({ initial }: { initial: number }) {
  const { toast } = useFeedback();
  const [v, setV] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await setSmsCostPerCredit(Number(v));
    setBusy(false);
    toast(r.ok ? "Saved." : r.error, r.ok ? "success" : "error");
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Provider cost per credit (GHS)</label>
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} w-36`} />
      </div>
      <button onClick={save} disabled={busy || Number(v) === initial} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-medium text-slate-100 hover:bg-white/15 disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save
      </button>
    </div>
  );
}
