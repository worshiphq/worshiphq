"use server";

import { openMomoToken } from "@/lib/billing/momo-token";
import { rateLimit, rateLimitAll, clientIp, HOUR, MINUTE } from "@/lib/rate-limit";
import { submitChargeOtp, CHARGE_REFERENCE_RE } from "@/lib/integrations/paystack-charge";
import { confirmAndFulfil } from "@/lib/billing/momo-start";
import type { MomoChargeStatus } from "@/lib/momo/charge-status";
import { isMomoNetworkId, toLocalGhanaMobile, type MomoNetworkId } from "@/lib/momo/networks";

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

/** Where the name check is asked from: a signed-in church paying WorshipHQ, or a public give page. */
export type MomoNameContext = { kind: "app" } | { kind: "give"; churchSlug: string };

export type MomoNameResult =
  | { status: "found"; name: string; network: MomoNetworkId; switched: boolean }
  | { status: "not_found" }
  | { status: "unavailable"; message?: string }
  | { status: "invalid"; message: string };

/**
 * The NAME CHECK before a Mobile Money charge: who owns this number, and on which network. Needs the same right to
 * pay as starting the charge (a signed-in church that can make changes, or a give page that takes gifts), and is
 * limited per address and per number. Returns only the account name and network.
 */
export async function checkMomoName(input: { phone: string; network: string | null; context: MomoNameContext }): Promise<MomoNameResult> {
  const phone = toLocalGhanaMobile(String(input?.phone ?? ""));
  if (!phone) return { status: "invalid", message: "Enter a Ghana mobile number, for example 024 123 4567." };
  const chosen = isMomoNetworkId(input?.network) ? input.network : null;
  const ctx = input?.context;

  let ipMax = 20;
  if (ctx?.kind === "give") {
    const { db } = await import("@/lib/db");
    const { allowPublicSubmission } = await import("@/lib/public-guard");
    const church = await db.church.findUnique({ where: { slug: String(ctx.churchSlug ?? "") }, select: { id: true, isDemo: true, givingBlocked: true } });
    if (!church || church.isDemo || church.givingBlocked) return { status: "unavailable" };
    if (!(await allowPublicSubmission("give-name", church.id))) return { status: "unavailable", message: "Too many checks. Please wait a few minutes." };
    ipMax = 10;
  } else {
    const { requireSession, assertCanWrite } = await import("@/lib/auth");
    const session = await requireSession();
    try {
      assertCanWrite(session);
    } catch (e) {
      return { status: "invalid", message: (e as Error).message };
    }
    if (session.impersonating) return { status: "invalid", message: "Support sessions can't make payments." };
  }

  const { phoneTag, lookupMomoName } = await import("@/lib/momo/resolve-name");
  const allowed = await rateLimitAll([
    { key: `momo:name:ip:${await clientIp()}`, max: ipMax, windowMs: 10 * MINUTE },
    { key: `momo:name:phone:${phoneTag(phone)}`, max: 6, windowMs: 10 * MINUTE },
  ]);
  if (!allowed) return { status: "unavailable", message: "Too many checks. Please wait a few minutes." };

  const r = await lookupMomoName(phone, chosen);
  if (r.status === "found") return { status: "found", name: r.name, network: r.network, switched: r.switched };
  return r.status === "not_found" ? { status: "not_found" } : { status: "unavailable" };
}
