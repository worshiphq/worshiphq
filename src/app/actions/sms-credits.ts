"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { initializePayment, newPaymentReference, SETTLEMENT_CURRENCY } from "@/lib/integrations/paystack";
import { addCredits } from "@/lib/sms/credits";
import { getCollectionProvider, hubtelConfig } from "@/lib/billing/collection-provider";
import { initHubtelCheckout } from "@/lib/integrations/hubtel-pay";
import { pricingPrice, pricingCredits } from "@/config/sms";
import { resolveSmsPricing } from "@/lib/sms/intl";
import type { MomoPay, MomoStartResult } from "@/lib/momo/types";

/**
 * Buy an SMS credit bundle via Paystack. In stub mode (no keys) the credits are
 * added immediately so the flow is demoable; with real keys the webhook adds
 * them on charge.success.
 */
export async function buySmsCredits(bundleId: string, pay?: MomoPay) {
  const session = await requireSession();
  assertCanWrite(session);
  // Price the bundle at THIS church's own pricing (Ghana tier, or international), never trusting the client.
  const pricing = await resolveSmsPricing(session.churchId);
  const bundle = pricing.bundles.find((b) => b.id === bundleId);
  if (!bundle) return { ok: false, stubbed: false, reference: "", error: "Unknown bundle." };

  return startSmsTopup(session, { credits: bundle.credits, priceGhs: bundle.priceGhs, bundleId: bundle.id }, pay);
}

/**
 * Start an SMS top-up with whichever provider the SuperAdmin switch currently points at. Paystack opens its
 * in-app popup; Hubtel hands back a hosted checkout URL (as authorizationUrl) that the client redirects to,
 * and remembers the intent so its callback can add the credits. Returns the same shape either way.
 */
async function startSmsTopup(
  session: { churchId: string; email?: string | null; impersonating?: boolean },
  grant: { credits: number; priceGhs: number; bundleId: string },
  pay?: MomoPay,
): Promise<{ ok: boolean; stubbed: boolean; reference: string; error?: string; authorizationUrl?: string; accessCode?: string; momo?: MomoStartResult }> {
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

  const metadata = { kind: "sms_topup", churchId: session.churchId, bundleId: grant.bundleId, credits: grant.credits };
  const addStubCredits = async (ref: string) => {
    await addCredits(session.churchId, grant.credits, "topup", {
      reference: ref,
      note: `${grant.credits.toLocaleString()} credits (demo top-up)`,
      amountGhs: grant.priceGhs,
      source: "paystack",
    });
    revalidatePath("/app/communications/credits");
  };

  // ── Mobile Money: charge the phone directly; the sheet follows it until it is approved. ──
  if (pay?.method === "momo") {
    if (session.impersonating) return { ok: false, stubbed: false, reference: "", error: "Support sessions can't make payments." };
    const { readMomoPay, checkPreviousAttempt, allowMomoStart, startMomoCharge } = await import("@/lib/billing/momo-start");
    const { newChargeReference } = await import("@/lib/integrations/paystack-charge");
    const mp = readMomoPay(pay);
    if (!mp.ok) return { ok: false, stubbed: false, reference: "", error: mp.error };
    const prev = await checkPreviousAttempt(pay.previous, session.churchId, "sms_topup");
    if (prev && "error" in prev) return { ok: false, stubbed: false, reference: "", error: prev.error };
    if (prev && "done" in prev) return { ok: true, stubbed: !!prev.done.stubbed, reference: prev.done.reference, momo: prev.done };
    if (!(await allowMomoStart({ churchId: session.churchId, phone: mp.phone }))) {
      return { ok: false, stubbed: false, reference: "", error: "Too many payment attempts. Please wait a few minutes and try again." };
    }
    const momoRef = newChargeReference();
    const started = await startMomoCharge({
      kind: "sms_topup", churchId: session.churchId, email, amount: grant.priceGhs, currency: SETTLEMENT_CURRENCY,
      phone: mp.phone, network: mp.network, metadata, reference: momoRef,
    });
    if (!started.ok) return { ok: false, stubbed: false, reference: momoRef, error: started.error };
    // Test mode (no Paystack key): no money moves, so the credits are added now, as the card path always did.
    if (started.momo.stubbed) await addStubCredits(momoRef);
    return { ok: true, stubbed: !!started.momo.stubbed, reference: momoRef, momo: started.momo };
  }

  const init = await initializePayment({
    email,
    amount: grant.priceGhs,
    currency: SETTLEMENT_CURRENCY,
    reference,
    callbackUrl: returnUrl,
    stubReturnUrl: returnUrl,
    metadata,
  });

  if (init.stubbed) await addStubCredits(reference);
  return init;
}

/** What a custom purchase would cost (or buy), priced at this church's own rate. The server decides; the form only previews. */
export async function quoteSmsCredits(input: { credits?: number; amountGhs?: number }) {
  const session = await requireSession();
  const pricing = await resolveSmsPricing(session.churchId);
  let credits = Math.floor(Number(input.credits) || 0);
  if (!credits && input.amountGhs) credits = pricingCredits(Number(input.amountGhs), pricing);
  credits = Math.min(pricing.max, Math.max(0, credits));
  return { credits, priceGhs: pricingPrice(credits, pricing), ok: credits >= pricing.min, min: pricing.min };
}

/**
 * Buy any number of credits (or any amount of money's worth). The price is always credits x the church's rate,
 * worked out here on the server.
 */
export async function buyCustomSmsCredits(input: { credits?: number; amountGhs?: number }, pay?: MomoPay) {
  const session = await requireSession();
  assertCanWrite(session);
  const q = await quoteSmsCredits(input);
  if (!q.ok) return { ok: false, stubbed: false, reference: "", error: `The smallest purchase is ${q.min} credits.` };

  return startSmsTopup(session, { credits: q.credits, priceGhs: q.priceGhs, bundleId: "custom" }, pay);
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
