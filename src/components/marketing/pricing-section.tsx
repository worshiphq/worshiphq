"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/reveal";
import { plans as defaultPlans, comparison, YEARLY_DISCOUNT_LABEL } from "@/config/pricing";
import { formatCurrency as defaultFmt } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { PlanPrices } from "@/lib/data/platform-config";

export function PricingSection({ showComparison = true, platformPricing }: { showComparison?: boolean; platformPricing?: { currency: string; currencySymbol: string; prices: PlanPrices } }) {
  const plans = defaultPlans.map((p) => {
    const dbPrice = platformPricing?.prices[p.id];
    return dbPrice ? { ...p, monthly: dbPrice.monthly, yearly: dbPrice.yearly } : p;
  });
  const sym = platformPricing?.currencySymbol ?? "₵";
  const formatCurrency = (amount: number) => platformPricing ? `${sym}${amount.toLocaleString()}` : defaultFmt(amount);
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="primary" className="mb-4">
            Simple, fair pricing
          </Badge>
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Pricing that grows with your church
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            Start free forever. Upgrade when you&rsquo;re ready.
          </p>
        </Reveal>

        {/* Toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className={cn("text-sm", !yearly ? "text-ink" : "text-ink-muted")}>Monthly</span>
          <button
            role="switch"
            aria-checked={yearly}
            onClick={() => setYearly((v) => !v)}
            className={cn(
              "relative h-7 w-12 rounded-full border border-line transition-colors",
              yearly ? "bg-primary" : "bg-surface-2",
            )}
          >
            <motion.span
              layout
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className={cn("absolute top-0.5 size-5 rounded-full bg-white", yearly ? "left-[1.6rem]" : "left-0.5")}
            />
          </button>
          <span className={cn("text-sm", yearly ? "text-ink" : "text-ink-muted")}>Yearly</span>
          <Badge variant="gold" className="ml-1">
            {YEARLY_DISCOUNT_LABEL}
          </Badge>
        </div>

        {/* Cards */}
        <div className="mt-12 grid gap-4 lg:grid-cols-4">
          {plans.map((plan, i) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const period = yearly ? "/yr" : "/mo";
            return (
              <Reveal key={plan.id} delay={i * 0.07}>
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl border p-6",
                    plan.featured
                      ? "border-primary/40 bg-gradient-to-b from-primary/10 to-surface glow"
                      : "card-surface",
                  )}
                >
                  {plan.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="primary" className="border-primary/40 bg-primary text-white shadow-sm">
                        Most popular
                      </Badge>
                    </div>
                  )}
                  <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-xs text-ink-muted">{plan.tagline}</p>
                  <div className="mt-5 flex items-end gap-1">
                    <span className="font-display text-4xl font-bold">
                      {price === 0 ? "Free" : formatCurrency(price)}
                    </span>
                    {price !== 0 && <span className="mb-1 text-sm text-ink-faint">{period}</span>}
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {plan.members}
                  </div>

                  <Link href={`/sign-up?plan=${plan.id}`} className="mt-5">
                    <Button variant={plan.featured ? "primary" : "secondary"} className="w-full">
                      {plan.cta}
                    </Button>
                  </Link>

                  <ul className="mt-6 space-y-3 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-ink-muted">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
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
          <Reveal className="mt-20">
            <h3 className="mb-6 text-center font-display text-2xl font-semibold">Compare every plan</h3>
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface/60">
                    <th className="p-4 text-left font-medium text-ink-muted">Features</th>
                    {plans.map((p) => (
                      <th key={p.id} className="p-4 text-center font-semibold">
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
      <tr className="bg-surface-2/40">
        <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-bright">
          {group.group}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-b border-line-soft last:border-0">
          <td className="p-4 text-ink-muted">{row.label}</td>
          {row.values.map((v, i) => (
            <td key={i} className="p-4 text-center">
              {typeof v === "boolean" ? (
                v ? (
                  <Check className="mx-auto size-4 text-success" />
                ) : (
                  <Minus className="mx-auto size-4 text-ink-faint" />
                )
              ) : (
                <span className="text-ink">{v}</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
