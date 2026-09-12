"use client";

import { useMemo, useState } from "react";
import { startOnlineGift } from "@/app/actions/public-giving";
import { usePaystack } from "@/components/payments/use-paystack";

// Always offered, whether or not the church has set these up as Funds yet.
const COMMON_FUNDS = ["Offertory", "Tithes", "Church Blessing", "Pledge", "Harvest"];
const CUSTOM = "Custom";

export function GiveForm({
  churchSlug,
  churchName,
  accentColor,
  funds,
}: {
  churchSlug: string;
  churchName: string;
  accentColor: string;
  funds: string[];
}) {
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { start } = usePaystack();

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

  const baseCore =
    "h-11 w-full rounded-xl border border-[#e8e2d6] bg-white text-sm text-[#1c1a16] placeholder:text-[#a09888] focus-visible:border-[#0d7377]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/20";
  const base = `${baseCore} px-3.5`;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />

      {/* ── Donor info ── */}
      <fieldset>
        <legend className="sr-only">Your details</legend>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Full name</label>
            <input autoFocus name="donor" className={base} placeholder="Kwame Mensah" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Phone number</label>
              <input name="phone" type="tel" inputMode="tel" className={base} placeholder="+233 24 000 0000" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Email</label>
              <input name="email" type="email" className={base} placeholder="you@example.com" />
            </div>
          </div>
        </div>
      </fieldset>

      {/* ── Amount ── */}
      <div className="border-t border-[#e8e2d6] pt-6">
        <label className="mb-2 block text-sm font-medium text-[#6b6560]">
          Amount (₵) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#6b6560]">
            ₵
          </span>
          <input
            name="amount"
            type="number"
            min="1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${baseCore} pl-8 pr-3.5 font-semibold`}
            style={{ fontSize: "1rem", color: "#1c1a16" }}
            placeholder="Enter amount"
          />
        </div>
      </div>

      {/* ── Fund ── */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Give towards</label>
        <input type="hidden" name="fund" value={finalFund} />
        <select
          value={fundChoice}
          onChange={(e) => setFundChoice(e.target.value)}
          className={base}
        >
          {fundOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
          <option value={CUSTOM}>Other (type your own)</option>
        </select>

        {fundChoice === CUSTOM && (
          <input
            value={customFund}
            onChange={(e) => setCustomFund(e.target.value)}
            className={`${base} mt-2`}
            placeholder="What are you giving towards?"
            required
          />
        )}

        {fundChoice === "Pledge" && (
          <input
            value={pledgeFor}
            onChange={(e) => setPledgeFor(e.target.value)}
            className={`${base} mt-2`}
            placeholder="What program is this pledge for? (e.g. Building Project 2026)"
          />
        )}
      </div>

      <div className="border-t border-[#e8e2d6] pt-6">
        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
          style={{ backgroundColor: accentColor }}
        >
          {submitting ? "Opening secure checkout…" : `Give ₵${amount || "0"} now`}
        </button>
        <p className="mt-3 text-center text-xs text-[#a09888]">
          Secure giving to {churchName} via Paystack - choose Mobile Money or card at checkout. You'll receive a receipt by SMS and/or email.
        </p>
      </div>
    </form>
  );
}
