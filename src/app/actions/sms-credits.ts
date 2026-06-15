"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { initializePayment, newPaymentReference } from "@/lib/integrations/paystack";
import { addCredits } from "@/lib/sms/credits";
import { getBundle } from "@/config/sms";

/**
 * Buy an SMS credit bundle via Paystack. In stub mode (no keys) the credits are
 * added immediately so the flow is demoable; with real keys the webhook adds
 * them on charge.success.
 */
export async function buySmsCredits(bundleId: string) {
  const session = await requireSession();
  assertCanWrite(session);
  const bundle = getBundle(bundleId);
  if (!bundle) return;

  const reference = newPaymentReference();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const returnUrl = `${appUrl}/app/communications/credits?topup=${reference}`;

  const init = await initializePayment({
    email: session.email || `billing+${session.churchId}@worshiphq.org`,
    amountGhs: bundle.priceGhs,
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
    });
    revalidatePath("/app/communications/credits");
  }

  if (init.ok && init.authorizationUrl) redirect(init.authorizationUrl);
  redirect(returnUrl);
}

/** Toggle the welcome-SMS-on-registration setting. */
export async function setWelcomeSms(on: boolean) {
  const session = await requireSession();
  assertCanWrite(session);
  await db.church.update({ where: { id: session.churchId }, data: { smsWelcomeMember: on } });
  revalidatePath("/app/communications/credits");
}
