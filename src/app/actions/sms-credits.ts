"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { addCredits } from "@/lib/sms/credits";
import { getCollectionProvider, hubtelConfig } from "@/lib/billing/collection-provider";
import { initHubtelCheckout } from "@/lib/integrations/hubtel-pay";
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

  return startSmsTopup(session, { credits: bundle.credits, priceGhs: bundle.priceGhs, bundleId: bundle.id });
}

/**
 * Start an SMS top-up with whichever provider the SuperAdmin switch currently points at. Paystack opens its
 * in-app popup; Hubtel hands back a hosted checkout URL (as authorizationUrl) that the client redirects to,
 * and remembers the intent so its callback can add the credits. Returns the same shape either way.
 */
async function startSmsTopup(
  session: { churchId: string; email?: string | null },
  grant: { credits: number; priceGhs: number; bundleId: string },
) {
  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/communications/credits?topup=${reference}`;
  const email = session.email || `billing+${session.churchId}@worshiphq.org`;

  if ((await getCollectionProvider()) === "hubtel") {
    const cfg = hubtelConfig();
    if (cfg) {
      await db.paymentIntent.create({
        data: { clientReference: reference, provider: "hubtel", kind: "sms_topup", churchId: session.churchId, amountGhs: grant.priceGhs, credits: grant.credits },
      });
      const r = await initHubtelCheckout(cfg, {
        amountGhs: grant.priceGhs,
        description: `WorshipHQ SMS credits ${grant.credits}`,
        clientReference: reference,
        callbackUrl: `${appUrl}/api/webhooks/hubtel`,
        returnUrl,
        cancellationUrl: returnUrl,
        payeeEmail: email,
      });
      if (!r.ok) {
        await db.paymentIntent.update({ where: { clientReference: reference }, data: { status: "failed" } }).catch(() => {});
        return { ok: false, stubbed: false, reference, error: r.error ?? "Could not start the Hubtel payment." };
      }
      // No inline popup: the client redirects to the hosted checkout URL, so pass it back as authorizationUrl.
      return { ok: true, stubbed: false, reference, authorizationUrl: r.checkoutUrl };
    }
    // Hubtel is selected but not configured: fall through to Paystack so a purchase never dead-ends.
  }

  const init = await initializePayment({
    email,
    amount: grant.priceGhs,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: returnUrl,
    stubReturnUrl: returnUrl,
    metadata: { kind: "sms_topup", churchId: session.churchId, bundleId: grant.bundleId, credits: grant.credits },
  });

  if (init.stubbed) {
    await addCredits(session.churchId, grant.credits, "topup", {
      reference,
      note: `${grant.credits.toLocaleString()} credits (demo top-up)`,
      amountGhs: grant.priceGhs,
      source: "paystack",
    });
    revalidatePath("/app/communications/credits");
  }
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

  return startSmsTopup(session, { credits: q.credits, priceGhs: q.priceGhs, bundleId: "custom" });
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
