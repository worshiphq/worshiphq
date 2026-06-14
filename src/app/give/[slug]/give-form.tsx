"use client";

import { useState } from "react";
import { startOnlineGift } from "@/app/actions/public-giving";
import { SubmitButton } from "@/components/ui/submit-button";

const PRESETS = [20, 50, 100, 200, 500];
const METHODS = ["MTN MoMo", "Telecel Cash", "AirtelTigo", "Card"];

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
  const [amount, setAmount] = useState<string>("100");
  const [method, setMethod] = useState<string>("MTN MoMo");

  const base =
    "flex h-11 w-full rounded-xl border border-[#e8e2d6] bg-white px-3.5 text-sm text-[#1c1a16] placeholder:text-[#a09888] focus-visible:border-[#0d7377]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/20";

  return (
    <form
      action={startOnlineGift}
      className="space-y-6 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />
      <input type="hidden" name="method" value={method} />

      {/* ── Amount ── */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#6b6560]">
          Amount (₵) <span className="text-red-500">*</span>
        </label>
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                Number(amount) === p
                  ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                  : { borderColor: "#e8e2d6", color: "#6b6560" }
              }
            >
              ₵{p}
            </button>
          ))}
        </div>
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
            className={`${base} pl-8 text-base font-semibold`}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* ── Fund ── */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Give towards</label>
        <select name="fund" defaultValue={funds[0] ?? "General"} className={base}>
          {funds.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* ── Payment method ── */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#6b6560]">Payment method</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className="rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors"
              style={
                method === m
                  ? { backgroundColor: `${accentColor}12`, borderColor: accentColor, color: accentColor }
                  : { borderColor: "#e8e2d6", color: "#6b6560" }
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Donor info ── */}
      <fieldset className="border-t border-[#e8e2d6] pt-6">
        <legend className="mb-4 text-base font-semibold text-[#1c1a16]">Your details</legend>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Full name</label>
            <input name="donor" className={base} placeholder="Kwame Mensah" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">
                Phone (for receipt)
              </label>
              <input name="phone" className={base} placeholder="+233 24 000 0000" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Email</label>
              <input name="email" type="email" className={base} placeholder="you@example.com" />
            </div>
          </div>
        </div>
      </fieldset>

      <div className="border-t border-[#e8e2d6] pt-6">
        <SubmitButton
          pendingLabel="Redirecting to secure checkout…"
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ backgroundColor: accentColor }}
        >
          Give ₵{amount || "0"} now
        </SubmitButton>
        <p className="mt-3 text-center text-xs text-[#a09888]">
          Secure giving to {churchName} via Paystack. You'll receive a receipt by SMS or email.
        </p>
      </div>
    </form>
  );
}
