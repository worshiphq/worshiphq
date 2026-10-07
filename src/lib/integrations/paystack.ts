import "server-only";
import crypto from "node:crypto";
import { env, features } from "@/lib/env";

/** The currency the Paystack merchant account actually settles in. Prices may be
 *  DISPLAYED in another currency (e.g. USD), but every charge is sent to Paystack
 *  in this currency - sending an unsupported one fails with "currency not
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
 * Telecel Cash, AirtelTigo Money) and cards. Currency is dynamic - set by
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
  /**
   * A church's Paystack subaccount code (ACCT_xxx) to split this charge to -
   * used for online giving so the money settles to the church's own account
   * instead of the platform's. Leave unset for WorshipHQ's own revenue
   * (subscriptions, SMS credits).
   */
  subaccount?: string | null;
}): Promise<InitResult> {
  const reference = opts.reference ?? newPaymentReference();
  const amount = opts.amount ?? opts.amountGhs ?? 0;
  const currency = opts.currency ?? "GHS";
  const subunit = Math.round(amount * 100);

  if (!features.payments) {
    console.info(`[Paystack:stub] init ${currency} ${amount} for ${opts.email} (ref ${reference})${opts.subaccount ? ` -> subaccount ${opts.subaccount}` : ""}`);
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
        ...(opts.subaccount ? { subaccount: opts.subaccount } : {}),
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

/* ── Subaccount setup (church online-giving settlement) ───────────────── */

export type Bank = { name: string; code: string; type?: string; currency?: string };

const STUB_BANKS: Bank[] = [
  { name: "MTN Mobile Money", code: "MTN", type: "mobile_money" },
  { name: "Telecel Cash", code: "VODAFONE", type: "mobile_money" },
  { name: "AirtelTigo Money", code: "ATL", type: "mobile_money" },
  { name: "GCB Bank", code: "040100", type: "ghipss" },
  { name: "Ecobank Ghana", code: "130100", type: "ghipss" },
  { name: "Fidelity Bank Ghana", code: "240100", type: "ghipss" },
  { name: "Absa Bank Ghana", code: "030100", type: "ghipss" },
];

/** List banks / mobile-money providers Paystack can settle to, for a currency.
 *  `type: "mobile_money"` returns the Ghana telcos; omit for regular banks. */
export async function listBanks(opts: { currency?: string; type?: string } = {}): Promise<{ ok: boolean; banks: Bank[]; stubbed: boolean; error?: string }> {
  const currency = opts.currency ?? SETTLEMENT_CURRENCY;
  if (!features.payments) {
    const banks = opts.type ? STUB_BANKS.filter((b) => b.type === opts.type) : STUB_BANKS;
    return { ok: true, stubbed: true, banks };
  }
  try {
    const url = new URL("https://api.paystack.co/bank");
    url.searchParams.set("currency", currency);
    if (opts.type) url.searchParams.set("type", opts.type);
    url.searchParams.set("perPage", "100");
    const res = await fetch(url, { headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } });
    const data = await res.json();
    if (!res.ok || !data?.status) return { ok: false, stubbed: false, banks: [], error: data?.message ?? "Could not load banks." };
    const banks: Bank[] = (data.data ?? []).map((b: { name: string; code: string; type?: string; currency?: string }) => ({ name: b.name, code: b.code, type: b.type, currency: b.currency }));
    return { ok: true, stubbed: false, banks };
  } catch (e) {
    return { ok: false, stubbed: false, banks: [], error: (e as Error).message };
  }
}

/** Resolve the account holder's name for an account/MoMo number at a bank/telco.
 *  Read-only on Paystack (no side effects), so safe to call for a confirm step. */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<{ ok: boolean; accountName?: string; stubbed: boolean; error?: string }> {
  if (!features.payments) {
    return { ok: true, stubbed: true, accountName: "DEMO ACCOUNT NAME" };
  }
  try {
    const url = new URL("https://api.paystack.co/bank/resolve");
    url.searchParams.set("account_number", accountNumber);
    url.searchParams.set("bank_code", bankCode);
    const res = await fetch(url, { headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } });
    const data = await res.json();
    if (!res.ok || !data?.status) return { ok: false, stubbed: false, error: data?.message ?? "Could not verify that account." };
    return { ok: true, stubbed: false, accountName: data?.data?.account_name };
  } catch (e) {
    return { ok: false, stubbed: false, error: (e as Error).message };
  }
}

/** Create a Paystack subaccount the church's online giving settles to.
 *  percentageCharge = the % of each gift that stays with the MAIN (WorshipHQ)
 *  account; 0 means the church keeps everything (minus Paystack's own fee). */
export async function createSubaccount(opts: {
  businessName: string;
  settlementBank: string;
  accountNumber: string;
  percentageCharge: number;
  description?: string;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
}): Promise<{ ok: boolean; subaccountCode?: string; stubbed: boolean; error?: string }> {
  if (!features.payments) {
    return { ok: true, stubbed: true, subaccountCode: `ACCT_stub_${Date.now().toString(36)}` };
  }
  try {
    const res = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        business_name: opts.businessName,
        settlement_bank: opts.settlementBank,
        account_number: opts.accountNumber,
        percentage_charge: opts.percentageCharge,
        description: opts.description,
        primary_contact_email: opts.primaryContactEmail || undefined,
        primary_contact_phone: opts.primaryContactPhone || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.status) return { ok: false, stubbed: false, error: data?.message ?? "Paystack rejected the subaccount." };
    return { ok: true, stubbed: false, subaccountCode: data?.data?.subaccount_code };
  } catch (e) {
    return { ok: false, stubbed: false, error: (e as Error).message };
  }
}

/** Update a subaccount: change where it settles, or switch it on/off.
 *  Paystack has NO delete endpoint for subaccounts - `active: false` is the
 *  official way to kill one (it stops receiving any split). */
export async function updateSubaccount(code: string, changes: {
  businessName?: string;
  settlementBank?: string;
  accountNumber?: string;
  description?: string;
  active?: boolean;
}): Promise<{ ok: boolean; stubbed: boolean; error?: string }> {
  if (!features.payments || code.startsWith("ACCT_stub_")) {
    console.info(`[Paystack:stub] update subaccount ${code}`, JSON.stringify(changes));
    return { ok: true, stubbed: true };
  }
  try {
    const res = await fetch(`https://api.paystack.co/subaccount/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...(changes.businessName !== undefined ? { business_name: changes.businessName } : {}),
        ...(changes.settlementBank !== undefined ? { settlement_bank: changes.settlementBank } : {}),
        ...(changes.accountNumber !== undefined ? { account_number: changes.accountNumber } : {}),
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        ...(changes.active !== undefined ? { active: changes.active } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.status) return { ok: false, stubbed: false, error: data?.message ?? "Paystack rejected the update." };
    return { ok: true, stubbed: false };
  } catch (e) {
    return { ok: false, stubbed: false, error: (e as Error).message };
  }
}

/** Gross up a gift so that, after Paystack's fee, the church receives `net`.
 *  Only used when the platform is set to "donor bears the fee". */
export function grossUpForFee(net: number, feePercent: number): number {
  const rate = Math.max(0, Math.min(feePercent, 20)) / 100;
  if (rate <= 0) return net;
  return Math.ceil((net / (1 - rate)) * 100) / 100;
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
 * webhooks - money typically reaches the customer's bank in 5-10 working days.
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
