"use client";

import { useState, useTransition } from "react";
import { DollarSign, Save, Check } from "lucide-react";
import { updatePlatformPricing } from "@/app/actions/admin";
import type { PlanPrices } from "@/lib/data/platform-config";

const PLAN_ORDER = ["free", "starter", "pro", "max"] as const;
const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  max: "Max",
};

const CURRENCIES = [
  { code: "GHS", symbol: "₵", name: "Ghana Cedi" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling" },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling" },
  { code: "XOF", symbol: "CFA", name: "West African CFA" },
];

export function PricingEditor({
  currency: initCurrency,
  currencySymbol: initSymbol,
  prices: initPrices,
}: {
  currency: string;
  currencySymbol: string;
  prices: PlanPrices;
}) {
  const [currency, setCurrency] = useState(initCurrency);
  const [symbol, setSymbol] = useState(initSymbol);
  const [prices, setPrices] = useState<PlanPrices>(() => {
    const p: PlanPrices = {};
    for (const plan of PLAN_ORDER) {
      p[plan] = initPrices[plan] ?? { monthly: 0, yearly: 0 };
    }
    return p;
  });
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);

  function setPrice(plan: string, field: "monthly" | "yearly", value: string) {
    const num = Number(value) || 0;
    setPrices((p) => ({ ...p, [plan]: { ...p[plan], [field]: num } }));
  }

  function handleCurrencyChange(code: string) {
    const c = CURRENCIES.find((x) => x.code === code);
    if (c) {
      setCurrency(c.code);
      setSymbol(c.symbol);
    }
  }

  function handleSave() {
    setSaved(false);
    startSave(async () => {
      await updatePlatformPricing(currency, symbol, prices);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Plan pricing</h2>
          <p className="text-sm text-slate-400">Set prices for each plan. Changes apply to all new subscriptions and the marketing site.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <><span className="whq-spin inline-block size-4 rounded-full border-2 border-white/30 border-t-white" /> Saving...</>
          ) : saved ? (
            <><Check className="size-4" /> Saved!</>
          ) : (
            <><Save className="size-4" /> Save pricing</>
          )}
        </button>
      </div>

      {/* Currency selector */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <DollarSign className="size-5 text-teal-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Currency</h3>
            <p className="text-xs text-slate-500">Applies to all plan prices and the billing page</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <select
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-slate-800">
                {c.symbol} — {c.name} ({c.code})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-400">
            Symbol: <span className="font-mono text-lg font-bold text-slate-100">{symbol}</span>
          </div>
        </div>
      </div>

      {/* Plan price cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => {
          const isFree = plan === "free";
          return (
            <div key={plan} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-bold text-slate-100">{PLAN_LABELS[plan]}</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-500">Monthly price ({symbol})</label>
                  <input
                    type="number"
                    min={0}
                    value={prices[plan]?.monthly ?? 0}
                    onChange={(e) => setPrice(plan, "monthly", e.target.value)}
                    disabled={isFree}
                    className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none disabled:opacity-30"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Yearly price ({symbol})</label>
                  <input
                    type="number"
                    min={0}
                    value={prices[plan]?.yearly ?? 0}
                    onChange={(e) => setPrice(plan, "yearly", e.target.value)}
                    disabled={isFree}
                    className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none disabled:opacity-30"
                  />
                </div>
                {!isFree && prices[plan]?.yearly > 0 && (
                  <div className="text-xs text-teal-400">
                    {symbol}{Math.round(prices[plan].yearly / 12)}/mo billed yearly
                    {prices[plan].monthly > 0 && (
                      <> · {Math.round((1 - prices[plan].yearly / 12 / prices[plan].monthly) * 100)}% savings</>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
