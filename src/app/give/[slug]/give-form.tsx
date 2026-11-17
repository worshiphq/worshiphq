"use client";

import { useMemo, useRef, useState } from "react";
import { startOnlineGift } from "@/app/actions/public-giving";
import { usePaystack } from "@/components/payments/use-paystack";
import { PaymentSheet, type MomoStartOutcome } from "@/components/payments/payment-sheet";
import type { MomoPay } from "@/lib/momo/types";
import { MemberFormFields, type SpecialRender } from "@/components/app/member-form-fields";
import type { FormField } from "@/lib/forms/registration";
import { splitGift, type FeeMode } from "@/lib/giving/fees";
import { Spinner } from "@/components/ui/spinner";

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
  momoEnabled = false,
}: {
  /** How the fee works for this church, so the giver sees the exact total before paying. */
  fee: { mode: FeeMode; feePercent: number; platformPercent: number; platformCap: number };
  churchSlug: string;
  churchName: string;
  accentColor: string;
  funds: string[];
  fields: FormField[];
  /** Mobile Money is paid in our own sheet, before the card popup. */
  momoEnabled?: boolean;
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

  // The filled-in form, kept while the payment sheet is open (the browser has already checked it).
  const [pending, setPending] = useState<FormData | null>(null);
  const thankYou = useRef<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (momoEnabled) { setPending(fd); return; }
    await payByCard(fd);
  }

  /** Mobile Money: the server charges the donor's phone and the sheet follows it until it is approved. */
  async function payByMomo(fd: FormData, pay: Extract<MomoPay, { method: "momo" }>): Promise<MomoStartOutcome> {
    const body = new FormData();
    fd.forEach((v, k) => body.append(k, v));
    body.set("payMethod", "momo");
    body.set("momoPhone", pay.phone);
    body.set("momoNetwork", pay.network);
    if (pay.previous) { body.set("momoPrevRef", pay.previous.reference); body.set("momoPrevToken", pay.previous.token); }
    const init = await startOnlineGift(body);
    if (!init.ok || !init.momo) return { ok: false, error: init.error ?? "Something went wrong starting your gift. Please try again." };
    thankYou.current = init.thankYouUrl;
    return { ok: true, momo: init.momo };
  }

  /** Card or other: Paystack's popup, as before. */
  async function payByCard(fd: FormData) {
    setSubmitting(true);
    try {
      const init = await startOnlineGift(fd);
      if (!init.ok) {
        // Live-mode failure still has a thank-you URL only in stub; show error.
        if (init.error) { setError(init.error); setSubmitting(false); return; }
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
          inputMode="decimal"
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
    <>
    {pending && (
      <PaymentSheet
        open
        onClose={() => setPending(null)}
        title={`Give to ${churchName}`}
        amountLabel={split ? money(split.charge) : money(typed || 0)}
        defaultPhone={String(pending.get("phone") ?? "") || null}
        onMomo={(pay) => payByMomo(pending, pay)}
        onCard={async () => { const fd = pending; setPending(null); await payByCard(fd); }}
        onSuccess={(ref) => { window.location.href = thankYou.current ?? `/give/${churchSlug}/thank-you?ref=${encodeURIComponent(ref)}`; }}
        successText="Thank you. Your gift has been received."
        nameContext={{ kind: "give", churchSlug }}
      />
    )}
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
              {submitting ? <span className="inline-flex items-center justify-center gap-2"><Spinner size="sm" /> Opening secure checkout…</span> : `Give ${split ? money(split.charge) : "₵0"} now`}
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
              Secure giving to {churchName} via Paystack - pay with Mobile Money or card. You&apos;ll receive a receipt by SMS and/or email.
            </p>
          </div>
        }
      />
    </form>
    </>
  );
}
