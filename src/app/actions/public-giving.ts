"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { initializePayment, newPaymentReference } from "@/lib/integrations/paystack";
import { recordOnlineGift, GIFT_METHOD_FROM_LABEL } from "@/lib/giving/record";
import { getPlatformConfig } from "@/lib/data/platform-config";

/**
 * Public online giving: a member/visitor gives via the church's shareable link.
 * No authentication required.
 *
 * - With Paystack keys configured → initialize a transaction and redirect to the
 *   hosted checkout. The webhook records the Gift on `charge.success`.
 * - In stub mode (no keys) → record the Gift immediately and go to thank-you, so
 *   the whole flow is demoable without credentials.
 */
export async function startOnlineGift(formData: FormData): Promise<void> {
  const churchSlug = String(formData.get("churchSlug") ?? "").trim();
  if (!churchSlug) return;

  const church = await db.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, isDemo: true },
  });
  if (!church || church.isDemo) return;

  const amount = Number(formData.get("amount") ?? 0);
  if (!amount || amount <= 0) return;

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

  const platformConfig = await getPlatformConfig();

  const init = await initializePayment({
    email: payerEmail,
    amount,
    currency: platformConfig.currency,
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

  if (init.ok && init.authorizationUrl) {
    redirect(init.authorizationUrl);
  }

  // Fallback: if initialization failed, still land the donor on thank-you.
  redirect(thankYouUrl);
}
