import type { NextRequest } from "next/server";
import { verifyPaystackSignature } from "@/lib/integrations/paystack";
import { recordOnlineGift, methodFromPaystackChannel } from "@/lib/giving/record";
import { addCredits } from "@/lib/sms/credits";
import { recordPlanPayment } from "@/lib/billing/payments";
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

  if (event.event !== "charge.success") {
    // Acknowledge everything else so Paystack doesn't retry.
    return Response.json({ received: true });
  }

  const data = event.data ?? {};
  const meta = (data.metadata ?? {}) as GiftMetadata;

  // SMS credit top-up → add credits to the church wallet (idempotent on reference).
  if (meta.kind === "sms_topup" && meta.churchId && data.reference) {
    try {
      const credits = Number(meta.credits ?? 0);
      if (credits > 0) {
        await addCredits(meta.churchId, credits, "topup", {
          reference: data.reference,
          note: `${credits} SMS credits`,
        });
      }
      return Response.json({ received: true, kind: "sms_topup" });
    } catch (e) {
      console.error("[Paystack webhook] failed to add SMS credits:", e);
      return new Response("Processing error", { status: 500 });
    }
  }

  // Plan upgrade → activate the subscription.
  if (meta.kind === "plan_upgrade" && meta.churchId && meta.plan && data.reference) {
    try {
      const validPlans = ["starter", "pro", "max"];
      const plan = String(meta.plan);
      const interval = meta.interval === "yearly" ? "yearly" : "monthly";
      if (!validPlans.includes(plan)) return Response.json({ received: true, ignored: true });

      const periodStart = new Date();
      const renewsAt = new Date();
      renewsAt.setMonth(renewsAt.getMonth() + (interval === "yearly" ? 12 : 1));

      await db.subscription.upsert({
        where: { churchId: meta.churchId },
        create: {
          churchId: meta.churchId,
          plan,
          interval,
          status: "active",
          renewsAt,
          paystackCustomerCode: data.customer?.email ?? null,
        },
        update: {
          plan,
          interval,
          status: "active",
          renewsAt,
          paystackCustomerCode: data.customer?.email ?? null,
        },
      });

      // Ledger entry — de-dupes on reference against verifyPlanUpgrade().
      // Paystack sends the charged amount in subunits (pesewas).
      const amountGhs = typeof data.amount === "number" ? data.amount / 100 : 0;
      const rate = Number(meta.usdToGhsRate) || 0;
      await recordPlanPayment({
        churchId: meta.churchId,
        reference: String(data.reference),
        plan,
        interval,
        amountUsd: Number(meta.displayAmountUsd) || (rate ? amountGhs / rate : 0),
        amountGhs,
        usdToGhsRate: rate,
        couponId: meta.couponId ? String(meta.couponId) : null,
        discountUsd: Math.max(0, (Number(meta.listAmountUsd) || 0) - (Number(meta.displayAmountUsd) || 0)),
        periodStart,
        periodEnd: renewsAt,
      });

      return Response.json({ received: true, kind: "plan_upgrade", plan });
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
    const result = await recordOnlineGift({
      churchId: meta.churchId,
      reference: data.reference,
      amountGhs: (data.amount ?? 0) / 100, // pesewas → cedis
      donorName: meta.donorName ?? "Anonymous",
      email: data.customer?.email ?? meta.email ?? null,
      phone: meta.phone ?? null,
      fundName: meta.fundName ?? null,
      method: methodFromPaystackChannel(data.channel, meta.method),
    });
    return Response.json({ received: true, created: result.created });
  } catch (e) {
    console.error("[Paystack webhook] failed to record gift:", e);
    // 500 → Paystack will retry, which is safe because recording is idempotent.
    return new Response("Processing error", { status: 500 });
  }
}

interface GiftMetadata {
  kind?: string;
  churchId?: string;
  donorName?: string;
  email?: string;
  phone?: string;
  fundName?: string;
  method?: string;
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
    channel?: string;
    customer?: { email?: string };
    metadata?: GiftMetadata;
  };
}
