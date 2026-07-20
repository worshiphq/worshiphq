"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Minus } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { plans as defaultPlans, comparison, YEARLY_DISCOUNT_LABEL } from "@/config/pricing";
import { formatCurrency as defaultFmt } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { PlanPrices } from "@/lib/data/platform-config";

export function PricingSection({ showComparison = true, platformPricing }: {
  showComparison?: boolean;
  platformPricing?: {
    currency: string; currencySymbol: string; prices: PlanPrices; usdToGhsRate?: number;
    /** Full plan definitions from the SuperAdmin plan editor. */
    planList?: Array<{
      id: string; name: string; tagline: string; monthly: number; yearly: number;
      membersLabel: string; featured: boolean; cta: string; marketingFeatures: string[];
    }>;
  };
}) {
  // Prefer the SuperAdmin-edited plans; fall back to the code defaults.
  const plans = platformPricing?.planList?.length
    ? platformPricing.planList.map((p) => ({
        id: p.id, name: p.name, tagline: p.tagline,
        monthly: p.monthly, yearly: p.yearly,
        members: p.membersLabel, featured: p.featured,
        cta: p.cta, features: p.marketingFeatures,
      }))
    : defaultPlans.map((p) => {
        const dbPrice = platformPricing?.prices[p.id];
        return dbPrice ? { ...p, monthly: dbPrice.monthly, yearly: dbPrice.yearly } : p;
      });
  const sym = platformPricing?.currencySymbol ?? "$";
  const formatCurrency = (amount: number) => platformPricing ? `${sym}${amount.toLocaleString()}` : defaultFmt(amount);
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <p className="rubric mb-4">Pricing</p>
          <div className="flex flex-wrap items-end justify-between gap-8 border-t-2 border-evergreen pt-8">
            <div className="max-w-xl">
              <h2 className="press-display text-4xl sm:text-5xl">
                Fair prices, plainly
                <span className="text-primary"> stated.</span>
              </h2>
              <p className="mt-3 text-sm text-ink-muted">
                Prices in US dollars, billed securely via Paystack.
              </p>
            </div>

            {/* Toggle — set like a ballot */}
            <div className="flex items-center gap-3">
              <span className={cn("text-sm transition-colors", !yearly ? "font-semibold text-evergreen-deep" : "text-ink-faint")}>
                Monthly
              </span>
              <button
                role="switch"
                aria-checked={yearly}
                onClick={() => setYearly((v) => !v)}
                className={cn(
                  "relative h-7 w-12 rounded-full border transition-colors",
                  yearly ? "border-evergreen bg-evergreen" : "border-ink/25 bg-surface-2",
                )}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                  className={cn("absolute top-0.5 size-5 rounded-full", yearly ? "left-[1.6rem] bg-parchment" : "left-0.5 bg-white shadow-sm")}
                />
              </button>
              <span className={cn("text-sm transition-colors", yearly ? "font-semibold text-evergreen-deep" : "text-ink-faint")}>
                Yearly
              </span>
              <span className="ml-1 text-xs font-medium text-brass">({YEARLY_DISCOUNT_LABEL})</span>
            </div>
          </div>
        </Reveal>

        {/* ── Ledger cards ── */}
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-ink/10 lg:border lg:border-ink/10">
          {plans.map((plan, i) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const period = yearly ? "/yr" : "/mo";
            const featured = plan.featured;
            return (
              <Reveal key={plan.id} delay={i * 0.08}>
                <div
                  className={cn(
                    "relative flex h-full flex-col p-7",
                    featured
                      ? "bg-evergreen-deep text-parchment lg:-my-5 lg:py-12 shadow-[0_30px_60px_-30px_rgba(11,43,38,0.55)]"
                      : "border border-ink/10 bg-surface lg:border-0",
                  )}
                >
                  {featured && (
                    <span className="absolute inset-x-7 top-3 h-px bg-brass/50" aria-hidden />
                  )}
                  {featured && (
                    <p className="rubric mb-3 !text-brass !text-[9px]">✦ most chosen ✦</p>
                  )}

                  <h3 className={cn("font-display text-2xl font-bold", featured ? "text-parchment" : "text-evergreen-deep")}>
                    {plan.name}
                  </h3>
                  <p className={cn("mt-1 text-xs", featured ? "text-parchment/60" : "text-ink-faint")}>
                    {plan.tagline}
                  </p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className={cn("font-display text-[2.6rem] font-bold leading-none tracking-tight", featured ? "text-parchment" : "text-evergreen-deep")}>
                      {price === 0 ? "Free" : formatCurrency(price)}
                    </span>
                    {price !== 0 && (
                      <span className={cn("text-sm", featured ? "text-parchment/60" : "text-ink-faint")}>
                        {period}
                      </span>
                    )}
                  </div>
                  <div className={cn("mt-1.5 text-[11px] uppercase tracking-[0.14em]", featured ? "text-brass" : "text-ink-faint")}>
                    {plan.members}
                  </div>

                  <Link
                    href={`/sign-up?plan=${plan.id}`}
                    className={cn(
                      "mt-6 inline-flex items-center justify-center rounded-full py-3 text-sm font-semibold transition-colors",
                      featured
                        ? "bg-parchment text-evergreen-deep hover:bg-white"
                        : "border border-evergreen/30 text-evergreen hover:bg-evergreen hover:text-parchment",
                    )}
                  >
                    {plan.cta}
                  </Link>

                  <ul className={cn("mt-7 flex-1 space-y-0 divide-y", featured ? "divide-parchment/10" : "divide-ink/6")}>
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className={cn("flex items-baseline gap-2.5 py-2.5 text-[13px] leading-snug", featured ? "text-parchment/85" : "text-ink-muted")}
                      >
                        <span className="text-[11px] text-brass">✦</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>

        {showComparison && (
          <Reveal className="mt-24">
            <div className="mb-8 text-center">
              <p className="rubric">Compare</p>
              <h3 className="press-display mt-3 text-3xl">Every plan, side by side</h3>
            </div>
            <div className="overflow-x-auto border border-ink/12">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b-2 border-evergreen bg-parchment">
                    <th className="p-4 text-left font-display text-sm font-bold text-evergreen-deep">Features</th>
                    {plans.map((p) => (
                      <th key={p.id} className="p-4 text-center font-display text-base font-bold text-evergreen-deep">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((grp) => (
                    <CompareGroup key={grp.group} group={grp} />
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

function CompareGroup({ group }: { group: (typeof comparison)[number] }) {
  return (
    <>
      <tr className="bg-surface-2/60">
        <td colSpan={5} className="px-4 py-2.5">
          <span className="rubric !text-[10px]">{group.group}</span>
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-b border-ink/6 last:border-0">
          <td className="p-4 text-ink-muted">{row.label}</td>
          {row.values.map((v, i) => (
            <td key={i} className="p-4 text-center">
              {typeof v === "boolean" ? (
                v ? (
                  <Check className="mx-auto size-4 text-evergreen" strokeWidth={2.5} />
                ) : (
                  <Minus className="mx-auto size-4 text-ink-faint/50" />
                )
              ) : (
                <span className="font-medium text-ink">{v}</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
