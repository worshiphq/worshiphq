import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { addCredits } from "@/lib/sms/credits";
import { isHubtelCallbackSuccess, readHubtelCallback } from "@/lib/integrations/hubtel-pay";

// Webhooks must never be cached and always run on the server.
export const dynamic = "force-dynamic";

/** The client IP Vercel saw, from the standard proxy headers. */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

/**
 * Hubtel Online Checkout callback. Hubtel POSTs the final status of a payment here. Unlike Paystack there is
 * no signature, so we (a) only accept it from Hubtel's published callback IP, and (b) only ever grant what a
 * matching pending PaymentIntent already says it should, keyed on our own unguessable clientReference, so a
 * stray or replayed call can never over-credit. Crediting itself is idempotent on the reference.
 */
export async function POST(request: NextRequest) {
  // Hubtel callbacks are unsigned, so accept only from Hubtel's published IP. Reject a missing or wrong IP:
  // on Vercel the real caller is always in x-forwarded-for, so a blank one means it is not really Hubtel.
  const ip = clientIp(request);
  if (env.HUBTEL_CALLBACK_IP && ip !== env.HUBTEL_CALLBACK_IP) {
    console.warn(`[Hubtel webhook] rejected callback from ${ip ?? "unknown IP"}`);
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const { clientReference, amountGhs, checkoutId } = readHubtelCallback(body);
  if (!clientReference) return Response.json({ received: true, ignored: "no reference" });

  const intent = await db.paymentIntent.findUnique({ where: { clientReference } });
  // Unknown or already-settled intents are acknowledged and ignored (idempotent).
  if (!intent || intent.status !== "pending") return Response.json({ received: true, ignored: true });

  if (!isHubtelCallbackSuccess(body)) {
    await db.paymentIntent.update({ where: { clientReference }, data: { status: "failed", checkoutId: checkoutId ?? intent.checkoutId } }).catch(() => {});
    return Response.json({ received: true, status: "failed" });
  }

  try {
    if (intent.kind === "sms_topup" && intent.credits && intent.credits > 0) {
      await addCredits(intent.churchId, intent.credits, "topup", {
        reference: clientReference, // de-dupe key: a reference is credited at most once
        note: `${intent.credits.toLocaleString()} SMS credits`,
        amountGhs: amountGhs ?? intent.amountGhs,
        source: "hubtel",
      });
    }
    await db.paymentIntent.update({ where: { clientReference }, data: { status: "paid", paidAt: new Date(), checkoutId: checkoutId ?? intent.checkoutId } });
    return Response.json({ received: true, status: "paid" });
  } catch (e) {
    console.error("[Hubtel webhook] failed to grant value:", e);
    // 500 so Hubtel retries; crediting is idempotent so a retry is safe.
    return new Response("Processing error", { status: 500 });
  }
}
