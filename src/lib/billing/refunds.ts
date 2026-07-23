import "server-only";
import { db } from "@/lib/db";

const DAY_MS = 86_400_000;

export interface RefundEligibility {
  eligible: boolean;
  /** Why they can't request — shown verbatim in the UI. */
  reason?: string;
  /** Last day they could have requested. */
  deadline?: Date;
  windowDays?: number;
  isFirstPayment?: boolean;
}

export interface RefundPolicy {
  firstDays: number;
  renewalDays: number;
  slaHours: number;
}

export async function getRefundPolicy(): Promise<RefundPolicy> {
  const cfg = await db.platformConfig.findUnique({
    where: { id: "default" },
    select: { refundWindowFirstDays: true, refundWindowRenewalDays: true, refundSlaHours: true },
  });
  return {
    firstDays: cfg?.refundWindowFirstDays ?? 14,
    renewalDays: cfg?.refundWindowRenewalDays ?? 7,
    slaHours: cfg?.refundSlaHours ?? 24,
  };
}

/**
 * Can this payment still be refunded?
 *
 * A church's FIRST paid subscription gets the longer money-back window; later
 * charges get the shorter one, which exists to catch accidental renewals rather
 * than to serve as a way of leaving a plan (that's what downgrading is for).
 * Zero-value payments (100% coupons) and already-refunded charges never qualify.
 */
export async function refundEligibility(paymentId: string, churchId: string): Promise<RefundEligibility> {
  const payment = await db.planPayment.findFirst({
    where: { id: paymentId, churchId },
    select: { id: true, paidAt: true, status: true, amountGhs: true },
  });
  if (!payment) return { eligible: false, reason: "We couldn't find that payment." };
  if (payment.status === "refunded") return { eligible: false, reason: "This payment has already been refunded." };
  if (payment.amountGhs <= 0) {
    return { eligible: false, reason: "There's nothing to refund — this didn't cost anything." };
  }

  // An open request already exists?
  const open = await db.refundRequest.findFirst({
    where: { paymentId: payment.id, status: { in: ["pending", "approved", "processing"] } },
    select: { id: true },
  });
  if (open) return { eligible: false, reason: "You've already requested a refund for this payment — we're reviewing it." };

  const policy = await getRefundPolicy();
  const earlier = await db.planPayment.count({
    where: { churchId, paidAt: { lt: payment.paidAt } },
  });
  const isFirst = earlier === 0;
  const windowDays = isFirst ? policy.firstDays : policy.renewalDays;
  const deadline = new Date(payment.paidAt.getTime() + windowDays * DAY_MS);

  if (Date.now() > deadline.getTime()) {
    const daysAgo = Math.floor((Date.now() - payment.paidAt.getTime()) / DAY_MS);
    return {
      eligible: false,
      reason: `The ${windowDays}-day refund window for this payment has passed (charged ${daysAgo} days ago). You can still schedule a downgrade — it takes effect at the end of the period you've paid for.`,
      deadline,
      windowDays,
      isFirstPayment: isFirst,
    };
  }

  return { eligible: true, deadline, windowDays, isFirstPayment: isFirst };
}
