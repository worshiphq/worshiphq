import type { NextRequest } from "next/server";
import { verifyPaystackSignature } from "@/lib/integrations/paystack";
import { recordOnlineGift, methodFromPaystackChannel } from "@/lib/giving/record";
import { addCredits } from "@/lib/sms/credits";
import { activatePlanPayment } from "@/lib/billing/activate-plan";
import { openSealedMetadata, rawMetadata } from "@/lib/billing/checkout-seal";
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

  const data = event.data ?? {};
  // Value-granting fields are only trusted when our seal matches this exact reference and amount.
  const sealed = openSealedMetadata(data) as GiftMetadata | null;
  const meta = (sealed ?? rawMetadata(data)) as GiftMetadata;

  // SMS credit top-up → add credits to the church wallet (idempotent on reference).
  if (meta.kind === "sms_topup" && meta.churchId && data.reference) {
    try {
      // Paystack reports the amount in the smallest unit (pesewas).
      const paid = Number(data.amount ?? 0) / 100;
      let credits = sealed ? Number(meta.credits ?? 0) : 0;
      if (!sealed && paid > 0) {
        // Unsealed: give exactly what the money paid buys at this church's rate.
        const { creditsForAmount } = await import("@/config/sms");
        const { resolveSmsTier } = await import("@/lib/sms/tier");
        credits = creditsForAmount(paid, await resolveSmsTier(meta.churchId));
      }
      if (credits > 0) {
        await addCredits(meta.churchId, credits, "topup", {
          reference: data.reference,
          note: `${credits.toLocaleString()} SMS credits`,
          amountGhs: paid > 0 ? paid : undefined,
          source: "paystack",
        });
      }
      return Response.json({ received: true, kind: "sms_topup" });
    } catch (e) {
      console.error("[Paystack webhook] failed to add SMS credits:", e);
      return new Response("Processing error", { status: 500 });
    }
  }

  // Plan upgrade → activate the subscription (shared with verifyPlanUpgrade; once per reference).
  if (meta.kind === "plan_upgrade" && data.reference) {
    try {
      const res = await activatePlanPayment({ ...data, status: "success" });
      if (!res.ok) return Response.json({ received: true, ignored: true, reason: res.error });
      return Response.json({ received: true, kind: "plan_upgrade", plan: res.plan });
    } catch (e) {
      console.error("[Paystack webhook] failed to activate plan:", e);
      return new Response("Processing error", { status: 500 });
    }
  }

  // Only handle our online-giving charges; ignore subscription/other charges.
  if (meta.kind !== "online_gift" || !meta.churchId || !data.reference) {
    return Response.json({ received: true, ignored: true });
  }

  try {
    // Prefer the phone the donor typed on our form; for a card payment (or if
    // they left it blank) fall back to whatever Paystack captured itself -
    // e.g. the Mobile Money number used to complete the charge.
    const phone = meta.phone || data.customer?.phone || data.authorization?.mobile_money_number || null;
    // Record the amount the donor meant to give. When the donor bears Paystack's
    // fee we charge a grossed-up amount, so prefer the intended amount from
    // metadata; fall back to the charged amount for older/plain charges.
    // Only a sealed intended amount is trusted, and never more than what was actually charged.
    const charged = (data.amount ?? 0) / 100;
    const intended = sealed ? Number(meta.intendedAmount) : NaN;
    const amountGhs = Number.isFinite(intended) && intended > 0 && intended <= charged ? intended : charged;
    const result = await recordOnlineGift({
      churchId: meta.churchId,
      reference: data.reference,
      amountGhs, // cedis
      donorName: meta.donorName ?? "Anonymous",
      email: data.customer?.email ?? meta.email ?? null,
      phone,
      fundName: meta.fundName ?? null,
      method: methodFromPaystackChannel(data.channel, data.authorization?.bank),
      extra: parseExtra(meta.extra),
    });
    return Response.json({ received: true, created: result.created });
  } catch (e) {
    console.error("[Paystack webhook] failed to record gift:", e);
    // 500 → Paystack will retry, which is safe because recording is idempotent.
    return new Response("Processing error", { status: 500 });
  }
}

function parseExtra(raw: unknown): { label: string; value: string }[] | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.label === "string" && typeof x.value === "string").slice(0, 40) : undefined;
  } catch {
    return undefined;
  }
}

interface GiftMetadata {
  kind?: string;
  churchId?: string;
  donorName?: string;
  email?: string;
  phone?: string;
  fundName?: string;
  extra?: string;
  intendedAmount?: number | string;
  credits?: number | string;
  bundleId?: string;
  plan?: string;
  interval?: string;
  displayAmountUsd?: number | string;
  listAmountUsd?: number | string;
  usdToGhsRate?: number | string;
  couponId?: string | null;
}

interface PaystackEvent {
  event: string;
  data?: {
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
    customer?: { email?: string; phone?: string };
    authorization?: { mobile_money_number?: string; bank?: string };
    metadata?: GiftMetadata;
  };
}
