import "server-only";
import { db } from "@/lib/db";
import { recordPlanPayment, periodEndFor } from "@/lib/billing/payments";
import { openSealedMetadata, rawMetadata, type PaystackTxn } from "@/lib/billing/checkout-seal";

const PAID_PLANS = ["starter", "pro", "max"];

export type ActivateResult =
  | { ok: true; plan: string; interval: string; amountGhs: number; alreadyProcessed?: boolean }
  | { ok: false; error: string };

/**
 * Switch a plan on from a successful Paystack charge. The only place that does this, shared by the
 * webhook and the return-from-checkout check (verifyPlanUpgrade).
 *
 * - The plan, interval, church and coupon come from our sealed checkout metadata, never from the client.
 * - A charge with no valid seal (for example one started before seals existed) only counts if it paid
 *   at least the full list price of the plan it names.
 * - Each reference activates once: the payment row is written first and doubles as the claim.
 * - A prorated upgrade keeps the current renewal date (it only paid for the rest of the period).
 */
export async function activatePlanPayment(txn: PaystackTxn, expectChurchId?: string): Promise<ActivateResult> {
  if (txn.status && txn.status !== "success") return { ok: false, error: "Payment not confirmed yet." };
  const reference = String(txn.reference ?? "");
  if (!reference) return { ok: false, error: "Missing payment reference." };

  const sealed = openSealedMetadata(txn);
  const meta = sealed ?? rawMetadata(txn);
  if (meta.kind !== "plan_upgrade") return { ok: false, error: "That payment isn't a plan payment." };

  const churchId = String(meta.churchId ?? "");
  const plan = String(meta.plan ?? "");
  const interval = meta.interval === "yearly" ? "yearly" : "monthly";
  if (!churchId || !PAID_PLANS.includes(plan)) return { ok: false, error: "That payment isn't a plan payment." };
  if (expectChurchId && churchId !== expectChurchId) return { ok: false, error: "That payment belongs to a different church." };

  const amountGhs = Number(txn.amount ?? 0) / 100;
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const platformConfig = await getPlatformConfig();
  const rate = Number(meta.usdToGhsRate) || platformConfig.usdToGhsRate || 0;

  if (!sealed) {
    // Unsealed: honour it only at full price, with no proration or coupon.
    const price = platformConfig.prices[plan];
    const listUsd = interval === "yearly" ? Number(price?.yearly ?? 0) : Number(price?.monthly ?? 0);
    const fullGhs = Math.round(listUsd * platformConfig.usdToGhsRate);
    if (!(fullGhs > 0) || amountGhs + 0.01 < fullGhs || String(txn.currency ?? "GHS").toUpperCase() !== "GHS") {
      console.warn(`[billing] unsealed plan charge ${reference} paid ${amountGhs} for ${plan}/${interval}, ignored`);
      return { ok: false, error: "This payment couldn't be matched to a plan. Please contact support." };
    }
  }

  const prorated = !!sealed && (sealed.prorated === true || sealed.prorated === "true");
  const sub = await db.subscription.findUnique({ where: { churchId } });
  const now = new Date();
  const keepPeriod = prorated && !!sub?.renewsAt && sub.renewsAt.getTime() > now.getTime();
  const periodStart = keepPeriod ? (sub!.periodStart ?? now) : now;
  const renewsAt = keepPeriod ? sub!.renewsAt! : periodEndFor(interval, now);
  const couponId = sealed && sealed.couponId ? String(sealed.couponId) : null;
  const displayUsd = Number(sealed?.displayAmountUsd) || (rate ? amountGhs / rate : 0);

  // The payment row is the claim: whichever of webhook / return check gets here first does the work.
  const created = await recordPlanPayment({
    churchId,
    reference,
    plan,
    interval,
    amountUsd: displayUsd,
    amountGhs,
    usdToGhsRate: rate,
    couponId,
    discountUsd: Math.max(0, (Number(sealed?.listAmountUsd) || 0) - displayUsd),
    kind: prorated ? "upgrade" : "new",
    periodStart,
    periodEnd: renewsAt,
  });
  if (!created) return { ok: true, plan, interval, amountGhs, alreadyProcessed: true };

  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, plan, interval, status: "active", renewsAt, periodStart, paystackCustomerCode: txn.customer?.email ?? null },
    update: {
      plan, interval, status: "active", renewsAt, periodStart,
      scheduledPlan: null, cancelAtPeriodEnd: false,
      paystackCustomerCode: txn.customer?.email ?? null,
    },
  });

  // The coupon is used up by the payment that carried it, whichever path confirmed it.
  if (couponId) {
    const { redeemCoupon } = await import("@/lib/billing/coupons");
    await redeemCoupon(couponId, churchId);
  }

  try {
    const { plans } = await import("@/config/pricing");
    const { sendUpgradeReceipt } = await import("@/lib/billing/receipt");
    const name = plans.find((p) => p.id === plan)?.name ?? plan;
    await sendUpgradeReceipt(churchId, name, `₵${amountGhs.toLocaleString()}`, interval, reference, {
      amountGhs,
      discountGhs: couponId ? Math.max(0, Math.round(((Number(sealed?.listAmountUsd) || 0) - displayUsd) * rate)) : 0,
      from: periodStart,
      to: renewsAt,
      prorated,
    });
  } catch (e) {
    console.error("[billing] upgrade receipt failed:", (e as Error).message);
  }

  return { ok: true, plan, interval, amountGhs };
}
