"use client";

import { Lock, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { PlanId } from "@/lib/plan-gate";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  max: "Max",
};

export function UpgradeGate({
  feature,
  requiredPlan,
  children,
}: {
  feature: string;
  requiredPlan: PlanId;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-primary/10">
        <Lock className="size-6 text-primary-bright" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-ink">
        Upgrade to {PLAN_NAMES[requiredPlan] ?? requiredPlan}
      </h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        {feature} is available on the {PLAN_NAMES[requiredPlan]} plan and above.
        Upgrade to unlock this feature and more.
      </p>
      {children}
      <Link
        href="/app/settings?tab=billing"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
      >
        <Sparkles className="size-4" />
        View plans
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free: "bg-surface-2 text-ink-faint",
    starter: "bg-blue-500/10 text-blue-600",
    pro: "bg-primary/10 text-primary-bright",
    max: "bg-amber-500/10 text-amber-600",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[plan] ?? colors.free}`}>
      {PLAN_NAMES[plan] ?? plan}
    </span>
  );
}
