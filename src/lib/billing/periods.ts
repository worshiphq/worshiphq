import "server-only";
import { planRank, type PlanId } from "@/lib/plan-gate";

const DAY_MS = 86_400_000;

export type ChangeDirection = "upgrade" | "downgrade" | "same" | "new" | "renew";

/** A paid church may renew from this many days before its period ends, so nothing ever stops. */
export const RENEW_WINDOW_DAYS = 7;

export interface PlanChangePreview {
  direction: ChangeDirection;
  /** What they must pay right now, in display currency (USD). 0 for downgrades. */
  amountDueUsd: number;
  /** When the change takes effect. Upgrades: now. Downgrades: period end. */
  effectiveDate: Date;
  /** Renewal date after the change (unchanged for upgrades; the end of the NEW period for a renewal). */
  renewsAt: Date | null;
  daysLeft: number;
  /** Value of the unused portion of what they already paid. */
  unusedCreditUsd: number;
  /** Plain-English line for the UI. */
  summary: string;
}

/** What the credit maths needs to know about one payment inside the current period. */
export interface PeriodPayment {
  amountUsd: number;
  periodStart: Date;
  paidAt: Date;
}

/**
 * The unused value of what a church has paid for its current period.
 *
 * Each payment is credited for its own unused share. A payment covers the time from when it was made (or
 * the period start, if later) to the period end, so:
 *   - the first payment covers the whole period,
 *   - a prorated upgrade payment covers only what was left when it was paid,
 *   - a discounted payment is credited at the discounted amount, and a gift (0) at nothing.
 * Using only the LAST payment, as this used to, under-credited anyone who upgraded twice in one period,
 * because the second upgrade was credited from the small difference paid at the first.
 */
export function creditFromPayments(payments: PeriodPayment[], periodEnd: Date, now: Date): number {
  let total = 0;
  for (const p of payments) {
    const from = Math.max(p.periodStart.getTime(), p.paidAt.getTime());
    const covered = periodEnd.getTime() - from;
    if (covered <= 0 || p.amountUsd <= 0) continue;
    const unused = Math.max(0, periodEnd.getTime() - Math.max(now.getTime(), from));
    total += p.amountUsd * Math.min(1, unused / covered);
  }
  return round2(total);
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
 *  - Renew (same plan, within RENEW_WINDOW_DAYS of the end, or lapsed) → full price, and the new period
 *               starts where the old one ENDS, so renewing early never throws away days already paid for.
 */
export function previewPlanChange(opts: {
  currentPlan: string;
  newPlan: string;
  interval: string;
  /** Current period end (Subscription.renewsAt). */
  periodEnd: Date | null;
  /** What they actually paid across the current period (every payment that runs to its end), in USD. */
  amountPaidUsd: number;
  /** The interval of the plan they are ON now. An upgrade is priced on this, not on what the page happens to send. */
  currentInterval?: string;
  /**
   * Every paid payment that runs to the end of the current period. When given, the credit is worked out
   * payment by payment (see creditFromPayments) instead of from `amountPaidUsd` alone.
   */
  paymentsThisPeriod?: PeriodPayment[];
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
    // Same plan. A free church has nothing to renew; a paid one may renew near (or after) the end of its
    // period. Before this, "same" was returned here unconditionally, which meant a church could never pay
    // for another month of the plan it was already on.
    const end = opts.periodEnd;
    if (fromRank > 0 && end) {
      const msLeft = end.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / DAY_MS);
      if (daysLeft <= RENEW_WINDOW_DAYS) {
        // The new period starts where the old one ends. If it already ended, it starts today.
        const from = msLeft > 0 ? end : now;
        const renews = new Date(from);
        renews.setMonth(renews.getMonth() + (opts.interval === "yearly" ? 12 : 1));
        const price = round2(opts.newPlanPriceUsd);
        return {
          direction: "renew",
          amountDueUsd: price,
          effectiveDate: from,
          renewsAt: renews,
          daysLeft: Math.max(0, daysLeft),
          unusedCreditUsd: 0,
          summary: msLeft > 0
            ? `You'll pay $${price} to renew. Your current plan runs to ${fmt(end)}, and the new period carries on from there until ${fmt(renews)}. No days are lost.`
            : `You'll pay $${price} to renew today. It runs until ${fmt(renews)}.`,
        };
      }
      const opens = new Date(end.getTime() - RENEW_WINDOW_DAYS * DAY_MS);
      return {
        direction: "same",
        amountDueUsd: 0,
        effectiveDate: now,
        renewsAt: end,
        daysLeft,
        unusedCreditUsd: 0,
        summary: `You're on this plan until ${fmt(end)}. Renewing opens on ${fmt(opens)}.`,
      };
    }
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
  // The length of the period they are IN, not of the interval the page asked for. A yearly church
  // upgrading while the page sent "monthly" used to be measured against 30 days, so its fraction clamped
  // to 1 and it was credited the whole year's payment against a one-month price.
  const totalDays = periodLengthDays(opts.currentInterval ?? opts.interval);
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS));
  const fraction = Math.min(1, daysLeft / totalDays);
  // Credit for the unused part of what they have paid, payment by payment when we have the payments.
  const unusedCredit = opts.paymentsThisPeriod
    ? creditFromPayments(opts.paymentsThisPeriod, periodEnd, now)
    : round2(opts.amountPaidUsd * fraction);

  // ── Downgrade: no money moves, scheduled for period end ──
  if (toRank < fromRank) {
    return {
      direction: "downgrade",
      amountDueUsd: 0,
      effectiveDate: periodEnd,
      renewsAt: periodEnd,
      daysLeft,
      unusedCreditUsd: unusedCredit,
      summary: `You keep your current plan until ${fmt(periodEnd)}, then move down. No charge, and no refund - you've already paid for this period.`,
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
