"use client";

import { useMemo, useState } from "react";
import { startOnlineGift } from "@/app/actions/public-giving";
import { usePaystack } from "@/components/payments/use-paystack";
import { MemberFormFields, type SpecialRender } from "@/components/app/member-form-fields";
import type { FormField } from "@/lib/forms/registration";
import { splitGift, type FeeMode } from "@/lib/giving/fees";

// Always offered, whether or not the church has set these up as Funds yet.
const COMMON_FUNDS = ["Offertory", "Tithes", "Church Blessing", "Pledge", "Harvest"];
const CUSTOM = "Custom";

export function GiveForm({
  churchSlug,
  churchName,
  accentColor,
  funds,
  fields,
  fee,
}: {
  /** How the fee works for this church, so the giver sees the exact total before paying. */
  fee: { mode: FeeMode; feePercent: number; platformPercent: number; platformCap: number };
  churchSlug: string;
  churchName: string;
  accentColor: string;
  funds: string[];
  fields: FormField[];
}) {
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { start } = usePaystack();
  const typed = Number(amount);
  const split = typed > 0 ? splitGift({ amount: typed, mode: fee.mode, feePercent: fee.feePercent, platformPercent: fee.platformPercent, platformCap: fee.platformCap }) : null;
  const money = (n: number) => `₵${n.toFixed(2)}`;

  const fundOptions = useMemo(() => {
    const merged = [...funds];
    for (const f of COMMON_FUNDS) if (!merged.includes(f)) merged.push(f);
    return merged;
  }, [funds]);
  const [fundChoice, setFundChoice] = useState<string>(fundOptions[0] ?? "General");
  const [customFund, setCustomFund] = useState("");
  const [pledgeFor, setPledgeFor] = useState("");

  const finalFund =
    fundChoice === CUSTOM
      ? customFund.trim() || "General"
      : fundChoice === "Pledge" && pledgeFor.trim()
        ? `Pledge - ${pledgeFor.trim()}`
        : fundChoice;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const init = await startOnlineGift(new FormData(e.currentTarget));
      if (!init.ok) {
        // Live-mode failure still has a thank-you URL only in stub; show error.
        if (init.error) { setError(init.error); return; }
      }
      await start(init, {
        onSuccess: () => { window.location.href = init.thankYouUrl; },
        onCancel: () => setSubmitting(false),
        onError: (m) => { setError(m); setSubmitting(false); },
      });
    } catch {
      setError("Something went wrong starting your gift. Please try again.");
      setSubmitting(false);
    }
  }

  const base = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  const special: Record<string, SpecialRender> = {
    amount: ({ setValue }) => (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">₵</span>
        <input
          name="amount"
          type="number"
          min="1"
          step="0.01"
          required
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setValue(e.target.value); }}
          className={`${base} pl-8 pr-3.5 font-semibold`}
          style={{ fontSize: "1rem" }}
          placeholder="Enter amount"
        />
      </div>
    ),
    fund: () => (
      <div>
        <input type="hidden" name="fund" value={finalFund} />
        <select value={fundChoice} onChange={(e) => setFundChoice(e.target.value)} className={base}>
          {fundOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          <option value={CUSTOM}>Other (type your own)</option>
        </select>
        {fundChoice === CUSTOM && (
          <input value={customFund} onChange={(e) => setCustomFund(e.target.value)} className={`${base} mt-2`} placeholder="What are you giving towards?" required />
        )}
        {fundChoice === "Pledge" && (
          <input value={pledgeFor} onChange={(e) => setPledgeFor(e.target.value)} className={`${base} mt-2`} placeholder="What program is this pledge for? (e.g. Building Project 2026)" />
        )}
      </div>
    ),
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <input type="hidden" name="churchSlug" value={churchSlug} />
      <MemberFormFields
        fields={fields}
        departments={[]}
        stepped
        accent={accentColor}
        special={special}
        finalSlot={
          <div className="border-t border-line pt-6">
            {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
              style={{ backgroundColor: accentColor }}
            >
              {submitting ? "Opening secure checkout…" : `Give ${split ? money(split.charge) : "₵0"} now`}
            </button>
            {split && fee.mode === "giver" && split.addedToGiver > 0 && (
              <p className="mt-3 text-center text-sm text-ink-muted">
                {money(typed)} gift + {money(split.addedToGiver)} processing fee = <b className="text-ink">{money(split.charge)}</b>. {churchName} receives the full {money(typed)}.
              </p>
            )}
            {split && fee.mode === "church" && (
              <p className="mt-3 text-center text-sm text-ink-muted">
                You pay {money(typed)}. A small processing fee comes out of the gift, so {churchName} receives about {money(split.churchGets)}.
              </p>
            )}
            <p className="mt-3 text-center text-xs text-ink-faint">
              Secure giving to {churchName} via Paystack - choose Mobile Money or card at checkout. You&apos;ll receive a receipt by SMS and/or email.
            </p>
          </div>
        }
      />
    </form>
  );
}
