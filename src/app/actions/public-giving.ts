"use server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { recordOnlineGift, GIFT_METHOD_FROM_LABEL } from "@/lib/giving/record";

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
  error?: string;
};

const giftError = (error: string): GiftInit => ({ ok: false, stubbed: false, reference: "", thankYouUrl: "", error });

export async function startOnlineGift(formData: FormData): Promise<GiftInit> {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return giftError("Missing church.");

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true },
  });
  if (!church || church.isDemo) return giftError("This church can't receive gifts right now.");

  const amount = Number(formData.get("amount") ?? 0);
  if (!amount || amount <= 0) return giftError("Enter a valid amount.");

  const donorName = String(formData.get("donor") ?? "").trim() || "Anonymous";
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const fundName = String(formData.get("fund") ?? "").trim() || "General";
  const methodLabel = String(formData.get("method") ?? "MTN MoMo").trim();
  const method = GIFT_METHOD_FROM_LABEL[methodLabel] ?? "MTN_MoMo";

  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const thankYouUrl = `${appUrl}/give/${churchSlug}/thank-you?ref=${reference}`;

  // Paystack requires an email; fall back to a no-reply address for anonymous MoMo gifts.
  const payerEmail = email ?? `giving+${reference}@worshiphq.org`;

  const init = await initializePayment({
    email: payerEmail,
    // Gifts are entered in local currency (₵) and charged in the merchant's
    // settlement currency — never the display currency (which may be USD).
    amount,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: thankYouUrl,
    stubReturnUrl: thankYouUrl,
    metadata: {
      kind: "online_gift",
      churchId: church.id,
      donorName,
      email,
      phone,
      fundName,
      method: methodLabel,
    },
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
      method,
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
    error: init.error,
  };
}
