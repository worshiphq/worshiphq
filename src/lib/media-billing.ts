import "server-only";
import { db } from "@/lib/db";
import { recordPlanPayment, periodEndFor } from "@/lib/billing/payments";
import { openSealedMetadata, type PaystackTxn } from "@/lib/billing/checkout-seal";

/**
 * Buying WorshipHQ Live on its own (any church, including one that uses nothing else from WorshipHQ).
 * Charged in cedis through Paystack. The price depends on the church's WorshipHQ plan (SuperAdmin › Pricing ›
 * Promotions › WorshipHQ Live prices), less any running percentage-off promotion.
 */

export type MediaInterval = "monthly" | "yearly";

export async function mediaQuote(churchId: string, interval: MediaInterval) {
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { plan: true, status: true, renewsAt: true } });
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const { paidPlan } = await import("@/lib/plan-gate");
  const { mediaDiscountPercent } = await import("@/lib/promotions");
  const cfg = await getPlatformConfig();
  // The price follows the plan the church PAYS for (not a December step-up).
  const plan = paidPlan(sub);
  const percentOff = mediaDiscountPercent(plan, cfg.promotions);
  const list = cfg.promotions.livePrices[plan][interval];
  const ghs = Math.round(list * (1 - percentOff / 100) * 100) / 100;
  const rate = cfg.usdToGhsRate || 0;
  const usd = rate ? Math.round((ghs / rate) * 100) / 100 : 0;
  return { usd, ghs, rate, percentOff, plan };
}

export type MediaActivateResult = { ok: true; until: string; alreadyProcessed?: boolean } | { ok: false; error: string };

/**
 * Switch Media on from a successful Paystack charge we started (sealed). Once per reference: the payment row is the
 * claim. A paid period still running carries on from its end, so paying early loses no days. A trial does not.
 */
export async function activateMediaPayment(txn: PaystackTxn, expectChurchId?: string): Promise<MediaActivateResult> {
  if (txn.status && txn.status !== "success") return { ok: false, error: "Payment not confirmed yet." };
  const reference = String(txn.reference ?? "");
  const sealed = openSealedMetadata(txn);
  if (!reference || !sealed || sealed.kind !== "media") return { ok: false, error: "That payment isn't a WorshipHQ Live payment." };
  const churchId = String(sealed.churchId ?? "");
  const interval: MediaInterval = sealed.interval === "yearly" ? "yearly" : "monthly";
  if (!churchId) return { ok: false, error: "That payment isn't a WorshipHQ Live payment." };
  if (expectChurchId && churchId !== expectChurchId) return { ok: false, error: "That payment belongs to a different church." };

  const sub = await db.subscription.findUnique({ where: { churchId }, select: { mediaUntil: true, mediaIsTrial: true } });
  const now = new Date();
  const running = !!sub?.mediaUntil && sub.mediaUntil > now && !sub.mediaIsTrial;
  const periodStart = running ? sub!.mediaUntil! : now;
  const until = periodEndFor(interval, periodStart);
  const amountGhs = Number(txn.amount ?? 0) / 100;
  const rate = Number(sealed.rate) || 0;

  const created = await recordPlanPayment({
    churchId,
    reference,
    plan: "media",
    interval,
    amountUsd: Number(sealed.usd) || (rate ? amountGhs / rate : 0),
    amountGhs,
    usdToGhsRate: rate,
    kind: running ? "renewal" : "new",
    periodStart,
    periodEnd: until,
    source: "paystack",
  });
  if (!created) return { ok: true, until: until.toISOString(), alreadyProcessed: true };

  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, mediaUntil: until, mediaInterval: interval, mediaIsTrial: false, mediaTrialUsed: true },
    update: { mediaUntil: until, mediaInterval: interval, mediaIsTrial: false, mediaTrialUsed: true },
  });

  try {
    const { sendUpgradeReceipt } = await import("@/lib/billing/receipt");
    await sendUpgradeReceipt(churchId, "WorshipHQ Live", `₵${amountGhs.toLocaleString()}`, interval, reference, {
      amountGhs, discountGhs: 0, from: periodStart, to: until, prorated: false,
    });
  } catch (e) {
    console.error("[media-billing] receipt failed:", (e as Error).message);
  }
  return { ok: true, until: until.toISOString() };
}

/** Ask Paystack about a reference and apply it if paid (the return page uses this in case the webhook is late). */
export async function verifyMediaPayment(reference: string): Promise<MediaActivateResult> {
  const { env } = await import("@/lib/env");
  if (!env.PAYSTACK_SECRET_KEY) return { ok: false, error: "Payments are not set up." };
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data) return { ok: false, error: "We couldn't confirm the payment yet." };
  return activateMediaPayment(body.data as PaystackTxn);
}
