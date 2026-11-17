"use server";

import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { splitGift } from "@/lib/giving/fees";
import { getGivingSettings } from "@/lib/giving/settings";
import { recordOnlineGift } from "@/lib/giving/record";
import { FORM_KINDS, collectExtraAnswers } from "@/lib/forms/kinds";
import type { MomoStartResult } from "@/lib/momo/types";

/**
 * Public online giving: a member/visitor gives via the church's shareable link.
 * No authentication required.
 *
 * - With Paystack keys configured → initialize a transaction and redirect to the
 *   hosted checkout. The webhook records the Gift on `charge.success`.
 * - In stub mode (no keys) → record the Gift immediately and go to thank-you, so
 *   the whole flow is demoable without credentials.
 */
export type GiftInit = {
  ok: boolean;
  stubbed: boolean;
  accessCode?: string;
  authorizationUrl?: string;
  reference: string;
  thankYouUrl: string;
  /** What the donor is actually charged (gift + Paystack fee when the donor bears it). */
  charged?: number;
  error?: string;
  /** Mobile Money chosen in the payment sheet: the charge to follow until the donor approves it. */
  momo?: MomoStartResult;
};

const giftError = (error: string): GiftInit => ({ ok: false, stubbed: false, reference: "", thankYouUrl: "", error });

export async function startOnlineGift(formData: FormData): Promise<GiftInit> {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return giftError("Missing church.");

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true, isInternal: true, paystackSubaccountCode: true, givingBlocked: true, giveFormFields: true },
  });
  if (!church || church.isDemo) return giftError("This church can't receive gifts right now.");
  // The internal QA church only ever takes test-mode payments: never real money.
  if (church.isInternal && features.payments && !env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")) return giftError("This church can't receive gifts right now.");
  if (church.givingBlocked) return giftError("Online giving is temporarily unavailable for this church. Please contact the church directly.");
  // With no payout account, the money would land with WorshipHQ, not the church. So no gift is started until one is approved.
  if (features.payments && !church.paystackSubaccountCode) return giftError("Online giving is not set up for this church yet. Please contact the church directly.");

  const amount = Number(formData.get("amount") ?? 0);
  if (!amount || amount <= 0) return giftError("Enter a valid amount.");

  const donorName = String(formData.get("donor") ?? "").trim() || "Anonymous";
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const fundName = String(formData.get("fund") ?? "").trim() || "General";
  // Answers to the church's own extra giving questions travel with the payment and land on the gift.
  const extra = collectExtraAnswers(FORM_KINDS.give.resolve(church.giveFormFields), (id) => formData.getAll(id).map(String));
  // The payment sheet's choice: Mobile Money charges the donor's phone here; card (or nothing) keeps Paystack's popup,
  // where the donor can still choose either.
  const payMethod = String(formData.get("payMethod") ?? "") === "momo" ? "momo" : "card";

  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const thankYouUrl = `${appUrl}/give/${churchSlug}/thank-you?ref=${reference}`;

  // Paystack requires an email; fall back to a no-reply address for anonymous MoMo gifts.
  const payerEmail = email ?? `giving+${reference}@worshiphq.org`;

  // When the platform is set so the donor bears Paystack's fee, charge a little
  // extra so the church still receives the full amount the donor intended. The
  // Gift we record (and receipt we send) is always the intended `amount`.
  const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { paystackFeePercent: true } });
  const gs = await getGivingSettings(church.id);
  // With a payout account, the church receives an exact amount and WorshipHQ keeps a flat part (see splitGift).
  // Without one the whole payment lands with WorshipHQ, so only the giver's fee top-up applies.
  const split = splitGift({
    amount,
    mode: gs.mode,
    feePercent: cfg?.paystackFeePercent ?? 1.95,
    platformPercent: church.paystackSubaccountCode ? gs.platformPercent : 0,
    platformCap: gs.platformCap,
  });
  const chargeAmount = split.charge;

  const giftMetadata = {
    kind: "online_gift",
    churchId: church.id,
    donorName,
    email,
    phone,
    fundName,
    extra: extra.length ? JSON.stringify(extra) : undefined,
    // The amount the donor meant to give (what the church receives + what the
    // receipt shows) - distinct from the grossed-up amount actually charged.
    intendedAmount: amount,
  };
  const transactionCharge = church.paystackSubaccountCode && split.platformCut > 0 ? split.transactionCharge : undefined;

  // ── Mobile Money: charge the donor's phone directly; the sheet follows it until it is approved. ──
  if (payMethod === "momo") {
    const { readMomoPay, checkPreviousAttempt, allowMomoStart, startMomoCharge } = await import("@/lib/billing/momo-start");
    const { newChargeReference } = await import("@/lib/integrations/paystack-charge");
    const { allowPublicSubmission } = await import("@/lib/public-guard");
    const mp = readMomoPay({ method: "momo", phone: String(formData.get("momoPhone") ?? ""), network: String(formData.get("momoNetwork") ?? "") });
    if (!mp.ok) return giftError(mp.error);
    const previous = { reference: String(formData.get("momoPrevRef") ?? ""), token: String(formData.get("momoPrevToken") ?? "") };
    const prev = await checkPreviousAttempt(previous.reference && previous.token ? previous : undefined, church.id, "online_gift");
    if (prev && "error" in prev) return giftError(prev.error);
    const momoThanks = (ref: string) => `${appUrl}/give/${churchSlug}/thank-you?ref=${ref}`;
    if (prev && "done" in prev) {
      return { ok: true, stubbed: !!prev.done.stubbed, reference: prev.done.reference, thankYouUrl: momoThanks(prev.done.reference), charged: chargeAmount, momo: prev.done };
    }
    if (!(await allowPublicSubmission("give", church.id)) || !(await allowMomoStart({ churchId: church.id, phone: mp.phone, publicForm: true }))) {
      return giftError("Too many payment attempts. Please wait a few minutes and try again.");
    }
    const momoRef = newChargeReference();
    const started = await startMomoCharge({
      kind: "online_gift", churchId: church.id, email: email ?? `giving+${momoRef}@worshiphq.org`,
      amount: chargeAmount, currency: SETTLEMENT_CURRENCY, phone: mp.phone, network: mp.network,
      metadata: giftMetadata, subaccount: church.paystackSubaccountCode, transactionCharge, reference: momoRef,
    });
    if (!started.ok) return giftError(started.error);
    // Test mode (no Paystack key): no money moves, so the gift is recorded now, as the card path always did.
    if (started.momo.stubbed) {
      await recordOnlineGift({ churchId: church.id, reference: momoRef, amountGhs: amount, donorName, email, phone: phone ?? mp.phone, fundName, extra: extra.length ? extra : undefined });
    }
    return { ok: true, stubbed: !!started.momo.stubbed, reference: momoRef, thankYouUrl: momoThanks(momoRef), charged: chargeAmount, momo: started.momo };
  }

  const init = await initializePayment({
    email: payerEmail,
    // Gifts are entered in local currency (₵) and charged in the merchant's
    // settlement currency - never the display currency (which may be USD).
    amount: chargeAmount,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: thankYouUrl,
    stubReturnUrl: thankYouUrl,
    // Route the gift to the church's own Paystack subaccount when one is
    // configured (SuperAdmin → Payment Requests), so giving settles to the
    // church instead of WorshipHQ's platform account.
    subaccount: church.paystackSubaccountCode,
    // With no platform cut, the plain split already works exactly as intended (the giver's extra covers Paystack's fee, or the
    // fee comes out of the gift), so Paystack is left to do it. The flat amount is only sent when WorshipHQ keeps a cut.
    transactionCharge,
    metadata: giftMetadata,
  });

  // In stub mode there's no real payment, so record the gift now.
  if (init.stubbed) {
    await recordOnlineGift({
      churchId: church.id,
      reference,
      amountGhs: amount,
      donorName,
      email,
      phone,
      fundName,
      extra: extra.length ? extra : undefined,
    });
  }

  // Hand the init back so the donor pays in an in-app popup; stub mode carries
  // the thank-you URL as authorizationUrl for the redirect fallback.
  return {
    ok: init.ok,
    stubbed: init.stubbed,
    accessCode: init.accessCode,
    authorizationUrl: init.authorizationUrl ?? thankYouUrl,
    reference,
    thankYouUrl,
    charged: chargeAmount,
    error: init.error,
  };
}
