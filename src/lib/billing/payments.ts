import "server-only";
import { db } from "@/lib/db";

export interface RecordPlanPaymentInput {
  churchId: string;
  reference: string;
  plan: string;
  interval: string;
  amountUsd: number;
  amountGhs: number;
  usdToGhsRate: number;
  couponId?: string | null;
  discountUsd?: number;
  kind?: "new" | "renewal" | "upgrade";
  periodStart?: Date;
  periodEnd?: Date;
}

/** Period end for a plan bought now on the given interval. */
export function periodEndFor(interval: string, from: Date = new Date()): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + (interval === "yearly" ? 12 : 1));
  return end;
}

/**
 * Record a completed subscription payment.
 *
 * The same charge can arrive twice — once from verifyPlanUpgrade() when the
 * popup returns, and again from the Paystack webhook. `reference` is unique and
 * we no-op on conflict, so whichever lands first wins and the second is
 * harmless. Returns true only when this call actually created the row.
 */
export async function recordPlanPayment(input: RecordPlanPaymentInput): Promise<boolean> {
  const periodStart = input.periodStart ?? new Date();
  const periodEnd = input.periodEnd ?? periodEndFor(input.interval, periodStart);

  try {
    await db.planPayment.create({
      data: {
        churchId: input.churchId,
        reference: input.reference,
        plan: input.plan,
        interval: input.interval,
        amountUsd: input.amountUsd,
        amountGhs: input.amountGhs,
        usdToGhsRate: input.usdToGhsRate,
        couponId: input.couponId ?? null,
        discountUsd: input.discountUsd ?? 0,
        kind: input.kind ?? "new",
        periodStart,
        periodEnd,
      },
    });
    return true;
  } catch {
    // Unique violation on `reference` — already recorded by the other path.
    return false;
  }
}

/** Has this church ever paid before? Drives first-purchase refund windows. */
export async function isFirstPayment(churchId: string, excludeReference?: string): Promise<boolean> {
  const count = await db.planPayment.count({
    where: {
      churchId,
      ...(excludeReference ? { reference: { not: excludeReference } } : {}),
    },
  });
  return count === 0;
}
