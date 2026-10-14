"use client";

import { useMemo, useState } from "react";
import { Loader2, Check } from "lucide-react";
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
export function RecordPlanForm({ churches }: { churches: { id: string; name: string }[] }) {
  const { toast } = useFeedback();
  const [q, setQ] = useState("");
  const [churchId, setChurchId] = useState("");
  const [plan, setPlan] = useState("starter");
  const [months, setMonths] = useState(12);
  const [mode, setMode] = useState<"paid" | "gift">("paid");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Mobile Money");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => churches.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8), [churches, q]);
  const chosen = churches.find((c) => c.id === churchId);

  async function save() {
    if (!churchId) { toast("Choose a church first.", "error"); return; }
    setBusy(true);
    const r = await recordChurchPlan({ churchId, plan, months, mode, amountGhs: mode === "paid" ? Number(amount) : 0, method: mode === "paid" ? method : undefined, note });
    setBusy(false);
    if (r.ok) {
      toast(`Done. ${chosen?.name} is on ${plan} until ${new Date(r.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`, "success");
      setAmount(""); setNote("");
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Amount received (GHS)</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 2400" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">How they paid</label>
            <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Mobile Money, bank, cash…" className={field} />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Note (the church sees this in their billing history)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "gift" ? "e.g. Partner church" : "e.g. 3 years paid upfront"} className={field} />
      </div>

      <button onClick={save} disabled={busy || !churchId} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">
        {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Record it</>}
      </button>
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
