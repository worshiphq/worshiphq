import "server-only";
import crypto from "node:crypto";
import { env, features } from "@/lib/env";

export type InitResult = {
  ok: boolean;
  stubbed: boolean;
  authorizationUrl?: string;
  reference: string;
  error?: string;
};

/** Generate a unique Paystack-safe transaction reference. */
export function newPaymentReference(): string {
  return `whq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initialize a Paystack transaction. Supports Mobile Money (MTN MoMo,
 * Telecel Cash, AirtelTigo Money) and cards. Currency is dynamic — set by
 * the platform config (defaults to GHS). In stub mode it returns a fake
 * reference + local callback URL so the flow is fully demoable without keys.
 */
export async function initializePayment(opts: {
  email: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  /** Supply your own reference (so you can correlate before redirecting). */
  reference?: string;
  /** Where Paystack returns the donor after payment. */
  callbackUrl?: string;
  /** Where the stub-mode flow should send the donor (no real checkout). */
  stubReturnUrl?: string;
  /** @deprecated Use `amount` instead */
  amountGhs?: number;
}): Promise<InitResult> {
  const reference = opts.reference ?? newPaymentReference();
  const amount = opts.amount ?? opts.amountGhs ?? 0;
  const currency = opts.currency ?? "GHS";
  const subunit = Math.round(amount * 100);

  if (!features.payments) {
    console.info(`[Paystack:stub] init ${currency} ${amount} for ${opts.email} (ref ${reference})`);
    return {
      ok: true,
      stubbed: true,
      reference,
      authorizationUrl: opts.stubReturnUrl ?? `${env.NEXT_PUBLIC_APP_URL}/app/giving?demo_paid=${reference}`,
    };
  }

  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        email: opts.email,
        amount: subunit,
        currency,
        channels: ["mobile_money", "card", "bank"],
        callback_url: opts.callbackUrl ?? env.PAYSTACK_CALLBACK_URL,
        metadata: opts.metadata,
        reference,
      }),
    });
    const data = await res.json();
    return {
      ok: res.ok && data?.status,
      stubbed: false,
      reference,
      authorizationUrl: data?.data?.authorization_url,
      error: data?.message,
    };
  } catch (e) {
    return { ok: false, stubbed: false, reference, error: (e as Error).message };
  }
}

/**
 * Verify a Paystack webhook signature. Paystack signs the raw request body with
 * HMAC-SHA512 using your secret key and sends it as the `x-paystack-signature`
 * header. We prefer PAYSTACK_WEBHOOK_SECRET if set, else the secret key.
 */
export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const key = env.PAYSTACK_WEBHOOK_SECRET ?? env.PAYSTACK_SECRET_KEY;
  if (!key) return false;
  const expected = crypto.createHmac("sha512", key).update(rawBody).digest("hex");
  // Constant-time compare; lengths must match or timingSafeEqual throws.
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
