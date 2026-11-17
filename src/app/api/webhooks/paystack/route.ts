import type { NextRequest } from "next/server";
import { verifyPaystackSignature } from "@/lib/integrations/paystack";
import { fulfilPaystackCharge } from "@/lib/billing/fulfil-paystack";
import type { PaystackTxn } from "@/lib/billing/checkout-seal";
import { db } from "@/lib/db";

// Webhooks must never be statically cached and always run on the server.
export const dynamic = "force-dynamic";

/**
 * Paystack webhook receiver.
 *
 * Paystack POSTs payment events here and signs the raw body with HMAC-SHA512.
 * On `charge.success` we read the gift metadata we attached at init time and
 * record the Gift (idempotently, keyed on the transaction reference), then fire
 * the donor's receipt.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // ── Refund lifecycle ── Paystack processes an approved refund asynchronously
  // and then tells us the outcome. Settle the request + mark the payment.
  if (event.event === "refund.processed" || event.event === "refund.failed") {
    const refundData = (event.data ?? {}) as { transaction?: { reference?: string } | string; reference?: string };
    const txnRef =
      typeof refundData.transaction === "object"
        ? refundData.transaction?.reference
        : (refundData.transaction ?? refundData.reference);
    if (txnRef) {
      const payment = await db.planPayment.findUnique({ where: { reference: txnRef }, select: { id: true } });
      if (payment) {
        const req = await db.refundRequest.findFirst({
          where: { paymentId: payment.id, status: { in: ["processing", "approved"] } },
          orderBy: { requestedAt: "desc" },
          select: { id: true },
        });
        if (event.event === "refund.processed") {
          if (req) await db.refundRequest.update({ where: { id: req.id }, data: { status: "processed", processedAt: new Date() } });
          await db.planPayment.update({ where: { id: payment.id }, data: { status: "refunded" } });
        } else if (req) {
          await db.refundRequest.update({ where: { id: req.id }, data: { status: "failed", failureReason: "Paystack reported the refund failed." } });
        }
      }
    }
    return Response.json({ received: true });
  }

  if (event.event !== "charge.success") {
    // Acknowledge everything else so Paystack doesn't retry.
    return Response.json({ received: true });
  }

  // Credits, plans and gifts: shared with the Mobile Money status check (idempotent on the reference).
  try {
    const res = await fulfilPaystackCharge(event.data ?? {});
    if (res.ignored) return Response.json({ received: true, ignored: true, ...(res.reason ? { reason: res.reason } : {}) });
    return Response.json({ received: true, kind: res.kind, ...(res.plan ? { plan: res.plan } : {}), ...(res.created !== undefined ? { created: res.created } : {}) });
  } catch (e) {
    console.error("[Paystack webhook] failed to process charge:", e);
    // 500 -> Paystack will retry, which is safe because fulfilment is idempotent.
    return new Response("Processing error", { status: 500 });
  }
}

interface PaystackEvent {
  event: string;
  data?: PaystackTxn;
}
