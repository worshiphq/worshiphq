import "server-only";
import crypto from "node:crypto";
import { env, features } from "@/lib/env";

/** The currency the Paystack merchant account actually settles in. Prices may be
 *  DISPLAYED in another currency (e.g. USD), but every charge is sent to Paystack
 *  in this currency — sending an unsupported one fails with "currency not
 *  supported by merchant". Ghana merchants settle in GHS. */
export const SETTLEMENT_CURRENCY = env.PAYSTACK_CURRENCY || "GHS";

export type InitResult = {
  ok: boolean;
  stubbed: boolean;
  authorizationUrl?: string;
  /** Access code for the in-app Paystack Inline popup (resumeTransaction). */
  accessCode?: string;
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
      accessCode: data?.data?.access_code,
      error: data?.message,
    };
  } catch (e) {
    return { ok: false, stubbed: false, reference, error: (e as Error).message };
  }
}

export type RefundResult = {
  ok: boolean;
  stubbed: boolean;
  /** Paystack's own reference for the refund record. */
  refundRef?: string;
  status?: string;
  error?: string;
};

/**
 * Refund a transaction. `amountGhs` refunds only part of it; omit for a full
 * refund. Paystack processes it and then sends refund.processed / refund.failed
 * webhooks — money typically reaches the customer's bank in 5–10 working days.
 */
export async function refundTransaction(opts: {
  reference: string;
  amountGhs?: number;
  merchantNote?: string;
  customerNote?: string;
}): Promise<RefundResult> {
  if (!features.payments) {
    console.info(`[Paystack:stub] refund ${opts.reference} (${opts.amountGhs ?? "full"})`);
    return { ok: true, stubbed: true, refundRef: `stub_refund_${Date.now()}`, status: "processed" };
  }

  try {
    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        transaction: opts.reference,
        ...(opts.amountGhs ? { amount: Math.round(opts.amountGhs * 100) } : {}),
        currency: SETTLEMENT_CURRENCY,
        merchant_note: opts.merchantNote,
        customer_note: opts.customerNote,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.status) {
      return { ok: false, stubbed: false, error: data?.message ?? "Paystack rejected the refund." };
    }
    return {
      ok: true,
      stubbed: false,
      refundRef: data?.data?.id ? String(data.data.id) : undefined,
      status: data?.data?.status,
    };
  } catch (e) {
    return { ok: false, stubbed: false, error: (e as Error).message };
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
