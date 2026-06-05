import "server-only";
import { env, features } from "@/lib/env";

export type InitResult = {
  ok: boolean;
  stubbed: boolean;
  authorizationUrl?: string;
  reference: string;
  error?: string;
};

/**
 * Initialize a Paystack transaction (GHS). Supports Mobile Money (MTN MoMo,
 * Telecel Cash, AirtelTigo Money) and cards. In stub mode it returns a fake
 * reference + local callback URL so the giving flow is fully demoable without keys.
 */
export async function initializePayment(opts: {
  email: string;
  amountGhs: number;
  metadata?: Record<string, unknown>;
}): Promise<InitResult> {
  const reference = `whq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (!features.payments) {
    console.info(`[Paystack:stub] init ₵${opts.amountGhs} for ${opts.email} (ref ${reference})`);
    return {
      ok: true,
      stubbed: true,
      reference,
      authorizationUrl: `${env.NEXT_PUBLIC_APP_URL}/app/giving?demo_paid=${reference}`,
    };
  }

  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        email: opts.email,
        amount: Math.round(opts.amountGhs * 100), // pesewas
        currency: "GHS",
        channels: ["mobile_money", "card", "bank"],
        callback_url: env.PAYSTACK_CALLBACK_URL,
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
