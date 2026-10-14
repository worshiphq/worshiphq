"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { addCredits } from "@/lib/sms/credits";
import { getBundle, priceForCredits, creditsForAmount, MIN_CUSTOM_CREDITS, MAX_CUSTOM_CREDITS } from "@/config/sms";
import { resolveSmsTier } from "@/lib/sms/tier";

/**
 * Buy an SMS credit bundle via Paystack. In stub mode (no keys) the credits are
 * added immediately so the flow is demoable; with real keys the webhook adds
 * them on charge.success.
 */
export async function buySmsCredits(bundleId: string) {
  const session = await requireSession();
  assertCanWrite(session);
  // Price the bundle at THIS church's effective SMS tier (never trust the client).
  const tier = await resolveSmsTier(session.churchId);
  const bundle = getBundle(bundleId, tier);
  if (!bundle) return { ok: false, stubbed: false, reference: "", error: "Unknown bundle." };

  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/communications/credits?topup=${reference}`;

  const init = await initializePayment({
    email: session.email || `billing+${session.churchId}@worshiphq.org`,
    // Bundles are priced in GHS and charged in the merchant's settlement currency.
    amount: bundle.priceGhs,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: returnUrl,
    stubReturnUrl: returnUrl,
    metadata: {
      kind: "sms_topup",
      churchId: session.churchId,
      bundleId: bundle.id,
      credits: bundle.credits,
    },
  });

  if (init.stubbed) {
    await addCredits(session.churchId, bundle.credits, "topup", {
      reference,
      note: `${bundle.credits} credits (demo top-up)`,
      amountGhs: bundle.priceGhs,
      source: "paystack",
    });
    revalidatePath("/app/communications/credits");
  }

  // Return the init result so the client opens the in-app Paystack popup.
  // (Stub mode carries authorizationUrl = returnUrl for the redirect fallback.)
  return init;
}

/** What a custom purchase would cost (or buy), priced at this church's own rate. The server decides; the form only previews. */
export async function quoteSmsCredits(input: { credits?: number; amountGhs?: number }) {
  const session = await requireSession();
  const tier = await resolveSmsTier(session.churchId);
  let credits = Math.floor(Number(input.credits) || 0);
  if (!credits && input.amountGhs) credits = creditsForAmount(Number(input.amountGhs), tier);
  credits = Math.min(MAX_CUSTOM_CREDITS, Math.max(0, credits));
  return { credits, priceGhs: priceForCredits(credits, tier), ok: credits >= MIN_CUSTOM_CREDITS };
}

/**
 * Buy any number of credits (or any amount of money's worth). The price is always credits x the church's rate,
 * worked out here on the server.
 */
export async function buyCustomSmsCredits(input: { credits?: number; amountGhs?: number }) {
  const session = await requireSession();
  assertCanWrite(session);
  const q = await quoteSmsCredits(input);
  if (q.credits < MIN_CUSTOM_CREDITS) return { ok: false, stubbed: false, reference: "", error: `The smallest purchase is ${MIN_CUSTOM_CREDITS} credits.` };

  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/communications/credits?topup=${reference}`;
  const init = await initializePayment({
    email: session.email || `billing+${session.churchId}@worshiphq.org`,
    amount: q.priceGhs,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: returnUrl,
    stubReturnUrl: returnUrl,
    metadata: { kind: "sms_topup", churchId: session.churchId, bundleId: "custom", credits: q.credits },
  });
  if (init.stubbed) {
    await addCredits(session.churchId, q.credits, "topup", { reference, note: `${q.credits.toLocaleString()} credits (demo top-up)`, amountGhs: q.priceGhs, source: "paystack" });
    revalidatePath("/app/communications/credits");
  }
  return init;
}

/** Toggle the welcome-SMS-on-registration setting. */
export async function setWelcomeSms(on: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.church.update({ where: { id: session.churchId }, data: { smsWelcomeMember: on } });
  revalidatePath("/app/communications/credits");
}

/** Toggle the welcome-SMS-on-visitor-self-registration setting. */
export async function setWelcomeVisitorSms(on: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.church.update({ where: { id: session.churchId }, data: { smsWelcomeVisitor: on } });
  revalidatePath("/app/communications/credits");
}
