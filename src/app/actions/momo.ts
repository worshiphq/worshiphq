"use server";

import { openMomoToken } from "@/lib/billing/momo-token";
import { rateLimit, rateLimitAll, clientIp, HOUR } from "@/lib/rate-limit";
import { submitChargeOtp, CHARGE_REFERENCE_RE } from "@/lib/integrations/paystack-charge";
import { confirmAndFulfil } from "@/lib/billing/momo-start";
import type { MomoChargeStatus } from "@/lib/momo/charge-status";

export type OtpResult = { status: MomoChargeStatus; displayText?: string; message?: string };

/**
 * Telecel Cash: pass the payer's voucher code on to Paystack. Only the token the payment sheet holds for this
 * reference can do it, with 5 tries per payment and 20 an hour per address.
 */
export async function submitMomoOtp(reference: string, token: string, otp: string): Promise<OtpResult> {
  const tok = openMomoToken(token);
  if (!CHARGE_REFERENCE_RE.test(String(reference)) || !tok || tok.reference !== reference) {
    return { status: "error", message: "This payment has expired. Please start again." };
  }
  const code = String(otp ?? "").replace(/\s+/g, "");
  if (!/^\d{4,8}$/.test(code)) return { status: "send_otp", message: "Enter the code from your phone (4 to 8 digits)." };

  const allowed = await rateLimitAll([
    { key: `momo:otp:ref:${reference}`, max: 5, windowMs: HOUR },
    { key: `momo:otp:ip:${await clientIp()}`, max: 20, windowMs: HOUR },
  ]);
  if (!allowed) return { status: "error", message: "Too many tries. Please start the payment again." };

  const res = await submitChargeOtp(reference, code);
  if (res.status === "success") {
    // Give the next status check its full 10 seconds' rest, then apply it now if Paystack has settled it.
    await rateLimit(`momo:check:${reference}`, 1, 10_000);
    const ok = await confirmAndFulfil(reference, tok.churchId, tok.kind);
    return ok ? { status: "success" } : { status: "pending" };
  }
  return {
    status: res.status,
    ...(res.displayText ? { displayText: res.displayText } : {}),
    ...(res.message ? { message: res.message } : {}),
  };
}
