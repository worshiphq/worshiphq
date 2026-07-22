import "server-only";
import { db } from "@/lib/db";

export interface CouponCheck {
  ok: boolean;
  error?: string;
  couponId?: string;
  code?: string;
  /** Human label, e.g. "50% off" or "$20 off". */
  label?: string;
  /** Price after discount, in the display currency (USD). */
  newAmount?: number;
  /** How much was taken off. */
  saved?: number;
}

/** Apply a coupon's discount to a USD amount, never below zero. */
export function discountedAmount(
  amount: number,
  discountType: string,
  discountValue: number,
): number {
  const off = discountType === "percent" ? (amount * discountValue) / 100 : discountValue;
  return Math.max(0, Math.round((amount - off) * 100) / 100);
}

export function couponLabel(discountType: string, discountValue: number): string {
  return discountType === "percent" ? `${discountValue}% off` : `$${discountValue} off`;
}

/**
 * Validate a coupon for a given church/plan/interval and compute the new price.
 * Does NOT consume it — call redeemCoupon() once payment actually succeeds.
 */
export async function checkCoupon(opts: {
  code: string;
  churchId: string;
  plan: string;
  interval: string;
  amount: number;
}): Promise<CouponCheck> {
  const code = opts.code.trim();
  if (!code) return { ok: false, error: "Enter a coupon code." };

  // Codes are stored as typed but matched case-insensitively.
  const coupon = await db.coupon.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
  });
  if (!coupon) return { ok: false, error: "That coupon code isn't valid." };
  if (coupon.usedAt) return { ok: false, error: "This coupon has already been used." };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { ok: false, error: "This coupon has expired." };
  }
  if (coupon.churchId && coupon.churchId !== opts.churchId) {
    return { ok: false, error: "This coupon isn't valid for your church." };
  }
  if (coupon.plan && coupon.plan !== opts.plan) {
    return { ok: false, error: `This coupon only applies to the ${coupon.plan} plan.` };
  }
  if (coupon.interval && coupon.interval !== opts.interval) {
    return { ok: false, error: `This coupon only applies to ${coupon.interval} billing.` };
  }

  const newAmount = discountedAmount(opts.amount, coupon.discountType, coupon.discountValue);
  return {
    ok: true,
    couponId: coupon.id,
    code: coupon.code,
    label: couponLabel(coupon.discountType, coupon.discountValue),
    newAmount,
    saved: Math.round((opts.amount - newAmount) * 100) / 100,
  };
}

/**
 * Consume a coupon. The conditional update makes this atomic — if two requests
 * race, only the first sets usedAt and the second gets `false`.
 */
export async function redeemCoupon(couponId: string, churchId: string): Promise<boolean> {
  const res = await db.coupon.updateMany({
    where: { id: couponId, usedAt: null },
    data: { usedAt: new Date(), usedByChurchId: churchId },
  });
  return res.count === 1;
}

/** Suggest a code like WOR50OFF / WOR25OFF-4F2K. Kept short and readable. */
export function suggestCouponCode(discountType: string, discountValue: number, prefix = "WOR"): string {
  const amount = discountType === "percent" ? `${discountValue}` : `${discountValue}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${amount}OFF${rand}`;
}
