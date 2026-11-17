import "server-only";
import crypto from "node:crypto";
import { env, features } from "@/lib/env";
import { buildPaystackBody } from "@/lib/integrations/paystack";
import { MOMO_NETWORKS, type MomoNetworkId } from "@/lib/momo/networks";
import type { PaystackTxn } from "@/lib/billing/checkout-seal";
import { mapChargeResponse, type MomoChargeStatus, type MappedCharge } from "@/lib/momo/charge-status";

export { mapChargeResponse, type MomoChargeStatus, type MappedCharge };

/**
 * Direct Mobile Money charges through Paystack's Charge API (POST /charge), so the payer approves on their phone
 * without leaving our page. The metadata is sealed exactly like a popup checkout (buildPaystackBody), so the webhook
 * and activatePlanPayment treat both the same.
 */

const API = "https://api.paystack.co";
const TIMEOUT_MS = 30_000;

/**
 * A fresh reference for every charge attempt: whq-<ms>-<16 hex>. Paystack's charge references may only use letters,
 * digits, "-", "." and "=" (newPaymentReference uses "_"), and the time prefix lets the double-payment guard tell
 * how old an attempt is.
 */
export function newChargeReference(now = Date.now()): string {
  return `whq-${now}-${crypto.randomBytes(8).toString("hex")}`;
}

export const CHARGE_REFERENCE_RE = /^whq-(\d{13})-[0-9a-f]{16}$/;

/** When this charge reference was made (ms), or null for anything that is not one of ours. */
export function chargeReferenceTime(reference: string): number | null {
  const m = CHARGE_REFERENCE_RE.exec(reference);
  return m ? Number(m[1]) : null;
}

export type MomoChargeResult = MappedCharge & { reference: string; stubbed?: boolean };

const STUB_TEXT = "Test mode: this will approve itself in a few seconds.";

/** How long a stub (no Paystack key) charge waits before it reports success. */
export const STUB_APPROVE_MS = 6_000;

function stubRefusal(reference: string): MomoChargeResult | null {
  // Stub mode hands out credits, plans and gifts with no payment, so it must never run on the live site.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PAYMENT_STUB !== "1") {
    console.error("[Paystack] PAYSTACK_SECRET_KEY is missing in production; refusing to start a stub charge.");
    return { reference, status: "error", message: "Payments are temporarily unavailable. Please try again later." };
  }
  return null;
}

async function paystack(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; json: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/** Start a Mobile Money charge. `phone` must already be in the local 0XXXXXXXXX form (toLocalGhanaMobile). */
export async function chargeMobileMoney(opts: {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  phone: string;
  network: MomoNetworkId;
  metadata: Record<string, unknown>;
  subaccount?: string | null;
  transactionCharge?: number;
}): Promise<MomoChargeResult> {
  const { reference } = opts;
  if (!features.payments) {
    const refused = stubRefusal(reference);
    if (refused) return refused;
    console.info(`[Paystack:stub] momo charge ${opts.currency} ${opts.amount} ${opts.network} ${opts.phone} (ref ${reference})`);
    return { reference, status: "pay_offline", displayText: STUB_TEXT, stubbed: true };
  }
  const { body } = buildPaystackBody({
    email: opts.email, amount: opts.amount, currency: opts.currency, reference,
    metadata: opts.metadata, subaccount: opts.subaccount, transactionCharge: opts.transactionCharge,
  });
  try {
    const { json } = await paystack("/charge", {
      method: "POST",
      body: { ...body, mobile_money: { phone: opts.phone, provider: MOMO_NETWORKS[opts.network].paystack } },
    });
    return { reference, ...mapChargeResponse(json) };
  } catch (e) {
    console.error(`[Paystack] momo charge ${reference} failed to start:`, (e as Error).message);
    return { reference, status: "error", message: "We couldn't reach the payment service. Please try again." };
  }
}

/** Telecel Cash asks for a voucher code: send it on. */
export async function submitChargeOtp(reference: string, otp: string): Promise<MomoChargeResult> {
  if (!features.payments) {
    const refused = stubRefusal(reference);
    if (refused) return refused;
    return { reference, status: "pay_offline", displayText: STUB_TEXT, stubbed: true };
  }
  try {
    const { json } = await paystack("/charge/submit_otp", { method: "POST", body: { otp, reference } });
    return { reference, ...mapChargeResponse(json) };
  } catch {
    return { reference, status: "error", message: "We couldn't reach the payment service. Please try again." };
  }
}

/** Where a charge has got to (GET /charge/:reference). Paystack asks for at least 10 seconds between checks. */
export async function checkPendingCharge(reference: string, now = Date.now()): Promise<MomoChargeResult> {
  if (!features.payments) {
    if (stubRefusal(reference)) return { reference, status: "error", message: "Payments are temporarily unavailable." };
    const at = chargeReferenceTime(reference) ?? now;
    return now - at >= STUB_APPROVE_MS
      ? { reference, status: "success", stubbed: true }
      : { reference, status: "pay_offline", displayText: STUB_TEXT, stubbed: true };
  }
  try {
    const { json } = await paystack(`/charge/${encodeURIComponent(reference)}`);
    return { reference, ...mapChargeResponse(json) };
  } catch {
    // A slow network is not a failed payment: keep waiting.
    return { reference, status: "pending" };
  }
}

/** The settled transaction (GET /transaction/verify/:reference), or null if it can't be read. */
export async function verifyTransaction(reference: string): Promise<PaystackTxn | null> {
  if (!features.payments) return null;
  try {
    const { json } = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    const data = (json as { data?: PaystackTxn } | null)?.data;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}
