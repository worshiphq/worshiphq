import "server-only";
import { features } from "@/lib/env";
import { rateLimitAll, clientIp, MINUTE } from "@/lib/rate-limit";
import { isMomoNetworkId, toLocalGhanaMobile, MOMO_NETWORKS, type MomoNetworkId } from "@/lib/momo/networks";
import { explainMomoFailure } from "@/lib/momo/name-check";
import type { MomoPay, MomoPrevious, MomoStartResult } from "@/lib/momo/types";
import { signMomoToken, openMomoToken, type MomoKind } from "@/lib/billing/momo-token";
import {
  chargeMobileMoney, checkPendingCharge, verifyTransaction, chargeReferenceTime, newChargeReference, CHARGE_REFERENCE_RE,
} from "@/lib/integrations/paystack-charge";
import { openSealedMetadata } from "@/lib/billing/checkout-seal";
import { fulfilPaystackCharge } from "@/lib/billing/fulfil-paystack";

/** A pending earlier attempt younger than this blocks a new one, so one tap of "Try again" cannot charge twice. */
const PREVIOUS_PENDING_MS = 2 * MINUTE;

export const INVALID_MOMO_NUMBER = "Enter a Ghana mobile number, for example 024 123 4567.";

/** Check the phone and network the payer picked. */
export function readMomoPay(pay: MomoPay | undefined | null): { ok: true; phone: string; network: MomoNetworkId } | { ok: false; error: string } {
  if (!pay || pay.method !== "momo") return { ok: false, error: "Choose how to pay." };
  const phone = toLocalGhanaMobile(pay.phone);
  if (!phone) return { ok: false, error: INVALID_MOMO_NUMBER };
  if (!isMomoNetworkId(pay.network)) return { ok: false, error: "Choose your Mobile Money network." };
  return { ok: true, phone, network: pay.network };
}

/** Per-church (or per-receiving-church), per-IP and per-phone limits on starting charges. Each prompt hits a real phone. */
export async function allowMomoStart(opts: { churchId: string; phone: string; publicForm?: boolean }): Promise<boolean> {
  const ip = await clientIp();
  return rateLimitAll(
    opts.publicForm
      ? [
          { key: `momo:start:ip:${ip}`, max: 5, windowMs: 10 * MINUTE },
          { key: `momo:start:phone:${opts.phone}`, max: 3, windowMs: 10 * MINUTE },
        ]
      : [
          { key: `momo:start:church:${opts.churchId}`, max: 6, windowMs: 10 * MINUTE },
          { key: `momo:start:ip:${ip}`, max: 10, windowMs: 10 * MINUTE },
          { key: `momo:start:phone:${opts.phone}`, max: 3, windowMs: 10 * MINUTE },
        ],
  );
}

/**
 * Paystack says this charge succeeded: re-read it from /transaction/verify (never trusting the caller) and apply it,
 * but only when its own sealed metadata names this church and this kind of payment. Idempotent, so the webhook and
 * this check can both run. Returns true once the payment is confirmed successful.
 */
export async function confirmAndFulfil(reference: string, churchId: string, kind: MomoKind): Promise<boolean> {
  // Stub mode: the action already applied it when the charge started, and there is nothing to verify.
  if (!features.payments) return true;
  const txn = await verifyTransaction(reference);
  if (!txn || txn.status !== "success" || txn.reference !== reference) return false;
  const sealed = openSealedMetadata(txn);
  if (!sealed || sealed.churchId !== churchId || sealed.kind !== kind) {
    console.warn(`[momo] ${reference} did not match its token (church or kind); not applied here`);
    return false;
  }
  try {
    await fulfilPaystackCharge(txn);
  } catch (e) {
    // The webhook retries until it works, so the payment is still safe; tell the payer it went through.
    console.error(`[momo] ${reference} paid but could not be applied yet:`, (e as Error).message);
  }
  return true;
}

/**
 * The double-payment guard for "Try again": look at the attempt the sheet is replacing. If it has gone through, apply
 * it and report success instead of charging again; if it is still waiting and under two minutes old, refuse.
 */
export async function checkPreviousAttempt(
  previous: MomoPrevious | undefined,
  churchId: string,
  kind: MomoKind,
): Promise<{ done: MomoStartResult } | { error: string } | null> {
  if (!previous?.reference || !previous.token) return null;
  const tok = openMomoToken(previous.token);
  if (!tok || tok.reference !== previous.reference || tok.churchId !== churchId || tok.kind !== kind) return null;
  if (!CHARGE_REFERENCE_RE.test(tok.reference)) return null;
  const now = Date.now();
  const res = await checkPendingCharge(tok.reference, now);
  if (res.status === "success") {
    if (await confirmAndFulfil(tok.reference, churchId, kind)) {
      return { done: { reference: tok.reference, token: previous.token, status: "success", stubbed: res.stubbed } };
    }
    return { error: "Your last payment may still be going through. Check your phone first." };
  }
  const waiting = res.status === "pending" || res.status === "pay_offline" || res.status === "send_otp";
  const at = chargeReferenceTime(tok.reference) ?? 0;
  if (waiting && now - at < PREVIOUS_PENDING_MS) return { error: "Your last payment may still be going through. Check your phone first." };
  return null;
}

/** Start the Mobile Money charge and hand the sheet what it needs to follow it. */
export async function startMomoCharge(opts: {
  kind: MomoKind;
  churchId: string;
  email: string;
  amount: number;
  currency: string;
  phone: string;
  network: MomoNetworkId;
  metadata: Record<string, unknown>;
  subaccount?: string | null;
  transactionCharge?: number;
  /** Reuse a reference made earlier (so stub-mode bookkeeping uses the same one); a fresh one otherwise. */
  reference?: string;
}): Promise<{ ok: true; momo: MomoStartResult } | { ok: false; error: string }> {
  const reference = opts.reference ?? newChargeReference();
  const res = await chargeMobileMoney({
    email: opts.email, amount: opts.amount, currency: opts.currency, reference, phone: opts.phone, network: opts.network,
    metadata: opts.metadata, subaccount: opts.subaccount, transactionCharge: opts.transactionCharge,
  });
  if (res.status === "error" || res.status === "failed") {
    if (res.status === "failed") {
      // Say why in plain words; a refused number usually means it isn't on the chosen network.
      return { ok: false, error: `The payment didn't go through. ${explainMomoFailure(res.message, MOMO_NETWORKS[opts.network].label).text}` };
    }
    return { ok: false, error: res.message ?? "Could not start the payment. Please try again." };
  }
  const token = signMomoToken({ reference, churchId: opts.churchId, kind: opts.kind });
  // An immediate success (rare) is applied right away, verified like any other.
  if (res.status === "success" && !(await confirmAndFulfil(reference, opts.churchId, opts.kind))) {
    return { ok: true, momo: { reference, token, status: "pending" } };
  }
  return {
    ok: true,
    momo: { reference, token, status: res.status, ...(res.displayText ? { displayText: res.displayText } : {}), ...(res.message ? { message: res.message } : {}), ...(res.stubbed ? { stubbed: true } : {}) },
  };
}
