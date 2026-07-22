import "server-only";
import { planRank, type PlanId } from "@/lib/plan-gate";

const DAY_MS = 86_400_000;

export type ChangeDirection = "upgrade" | "downgrade" | "same" | "new";

export interface PlanChangePreview {
  direction: ChangeDirection;
  /** What they must pay right now, in display currency (USD). 0 for downgrades. */
  amountDueUsd: number;
  /** When the change takes effect. Upgrades: now. Downgrades: period end. */
  effectiveDate: Date;
  /** Renewal date after the change (unchanged for upgrades). */
  renewsAt: Date | null;
  daysLeft: number;
  /** Value of the unused portion of what they already paid. */
  unusedCreditUsd: number;
  /** Plain-English line for the UI. */
  summary: string;
}

export function periodLengthDays(interval: string): number {
  return interval === "yearly" ? 365 : 30;
}

/**
 * Work out what a plan change costs.
 *
 * The governing rule: **money only ever moves upward.**
 *  - Upgrade  → pay only the difference for the days remaining; the renewal
 *               date does not move.
 *  - Downgrade→ costs nothing and refunds nothing; it is scheduled for the end
 *               of the period they already paid for.
 *  - New (from free) → full price, fresh period.
 */
export function previewPlanChange(opts: {
  currentPlan: string;
  newPlan: string;
  interval: string;
  /** Current period end (Subscription.renewsAt). */
  periodEnd: Date | null;
  /** What they actually paid for the current period, in USD. */
  amountPaidUsd: number;
  /** List price of the new plan for this interval, in USD. */
  newPlanPriceUsd: number;
  now?: Date;
}): PlanChangePreview {
  const now = opts.now ?? new Date();
  const fromRank = planRank(opts.currentPlan as PlanId);
  const toRank = planRank(opts.newPlan as PlanId);

  const fresh = () => {
    const renews = new Date(now);
    renews.setMonth(renews.getMonth() + (opts.interval === "yearly" ? 12 : 1));
    return renews;
  };

  if (opts.currentPlan === opts.newPlan) {
    return {
      direction: "same",
      amountDueUsd: 0,
      effectiveDate: now,
      renewsAt: opts.periodEnd,
      daysLeft: 0,
      unusedCreditUsd: 0,
      summary: "You're already on this plan.",
    };
  }

  // Coming from Free (or no active paid period) → a normal full-price purchase.
  const hasPaidPeriod = fromRank > 0 && opts.periodEnd && opts.periodEnd.getTime() > now.getTime();
  if (!hasPaidPeriod) {
    if (toRank === 0) {
      return {
        direction: "downgrade",
        amountDueUsd: 0,
        effectiveDate: now,
        renewsAt: null,
        daysLeft: 0,
        unusedCreditUsd: 0,
        summary: "You'll move to the Free plan.",
      };
    }
    const renews = fresh();
    return {
      direction: "new",
      amountDueUsd: round2(opts.newPlanPriceUsd),
      effectiveDate: now,
      renewsAt: renews,
      daysLeft: periodLengthDays(opts.interval),
      unusedCreditUsd: 0,
      summary: `You'll pay $${round2(opts.newPlanPriceUsd)} today. Renews ${fmt(renews)}.`,
    };
  }

  const periodEnd = opts.periodEnd!;
  const totalDays = periodLengthDays(opts.interval);
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS));
  const fraction = Math.min(1, daysLeft / totalDays);
  const unusedCredit = round2(opts.amountPaidUsd * fraction);

  // ── Downgrade: no money moves, scheduled for period end ──
  if (toRank < fromRank) {
    return {
      direction: "downgrade",
      amountDueUsd: 0,
      effectiveDate: periodEnd,
      renewsAt: periodEnd,
      daysLeft,
      unusedCreditUsd: unusedCredit,
      summary: `You keep your current plan until ${fmt(periodEnd)}, then move down. No charge, and no refund — you've already paid for this period.`,
    };
  }

  // ── Upgrade: pay only the difference for the days remaining ──
  const newProrated = opts.newPlanPriceUsd * fraction;
  const amountDue = Math.max(0, round2(newProrated - unusedCredit));
  return {
    direction: "upgrade",
    amountDueUsd: amountDue,
    effectiveDate: now,
    renewsAt: periodEnd,
    daysLeft,
    unusedCreditUsd: unusedCredit,
    summary: amountDue > 0
      ? `You'll pay $${amountDue} now for the ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in this period. Your renewal date stays ${fmt(periodEnd)}.`
      : `Your existing credit covers the upgrade. Nothing to pay. Renewal date stays ${fmt(periodEnd)}.`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fmt(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
