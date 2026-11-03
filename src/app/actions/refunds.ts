"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { refundEligibility } from "@/lib/billing/refunds";
import { refundTransaction } from "@/lib/integrations/paystack";
import { noticeChurch } from "@/lib/billing/notices";

/**
 * SuperAdmin: log a refund request that a church sent by EMAIL.
 *
 * Churches no longer submit refund requests from inside the app. A request has to arrive in writing at the
 * support address, so there is always a record of what was asked and when, and so that nobody can be talked
 * into one over a chat or a call. This puts that emailed request into the review queue, where it is approved
 * or declined and paid back through Paystack like any other.
 *
 * The refund window is checked and reported, but you may log a request that is outside it, because whether to
 * make an exception is your call. An outside-window request is marked as such in the reason so the reviewer sees it.
 */
export async function logRefundRequest(input: { reference: string; reason: string }) {
  await requireSuperAdmin();
  const reference = String(input.reference ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (!reference) return { ok: false as const, error: "Enter the payment reference from their email." };
  if (reason.length < 5) return { ok: false as const, error: "Add a line on why they asked." };

  const payment = await db.planPayment.findUnique({
    where: { reference },
    select: { id: true, churchId: true, amountUsd: true, amountGhs: true, source: true, church: { select: { name: true } } },
  });
  if (!payment) return { ok: false as const, error: "No payment has that reference." };
  if (payment.source !== "paystack") return { ok: false as const, error: "Only card and Mobile Money payments taken through Paystack can be refunded here. Offline payments are refunded by hand." };

  const eligibility = await refundEligibility(payment.id, payment.churchId);
  // Already refunded, nothing paid, or a request already open can never be logged. Only the window can be waived.
  const windowOnly = !eligibility.eligible && !!eligibility.deadline;
  if (!eligibility.eligible && !windowOnly) return { ok: false as const, error: eligibility.reason ?? "This payment can't be refunded." };

  await db.refundRequest.create({
    data: {
      churchId: payment.churchId,
      paymentId: payment.id,
      amountUsd: payment.amountUsd,
      amountGhs: payment.amountGhs,
      reason: windowOnly ? `[OUTSIDE THE REFUND WINDOW] ${reason}` : reason,
      requestedByUserId: "email",
    },
  });
  revalidatePath("/admin/refunds");
  return { ok: true as const, church: payment.church.name, outsideWindow: windowOnly };
}

/** SuperAdmin: approve a refund and actually issue it through Paystack. */
export async function approveRefund(id: string, note?: string) {
  await requireSuperAdmin();

  const req = await db.refundRequest.findUnique({
    where: { id },
    include: { payment: { select: { reference: true, amountGhs: true } } },
  });
  if (!req) return { ok: false as const, error: "Request not found." };
  if (req.status !== "pending") return { ok: false as const, error: `This request is already ${req.status}.` };

  // Claim it first so a double-click can't refund twice.
  const claimed = await db.refundRequest.updateMany({
    where: { id, status: "pending" },
    data: { status: "approved", reviewedAt: new Date(), reviewerNote: note ?? null },
  });
  if (claimed.count !== 1) return { ok: false as const, error: "This request was already handled." };

  const res = await refundTransaction({
    reference: req.payment.reference,
    amountGhs: req.amountGhs,
    merchantNote: note ?? "Approved by WorshipHQ support",
    customerNote: "WorshipHQ subscription refund",
  });

  if (!res.ok) {
    await db.refundRequest.update({
      where: { id },
      data: { status: "failed", failureReason: res.error ?? "Paystack refund failed" },
    });
    return { ok: false as const, error: res.error ?? "Paystack rejected the refund." };
  }

  // Stub mode settles instantly; live mode waits for the refund.* webhook.
  const settled = res.stubbed;
  await db.refundRequest.update({
    where: { id },
    data: {
      status: settled ? "processed" : "processing",
      paystackRefundRef: res.refundRef ?? null,
      ...(settled ? { processedAt: new Date() } : {}),
    },
  });
  if (settled) {
    await db.planPayment.update({ where: { id: req.paymentId }, data: { status: "refunded" } });
  }

  // The money is going back, so the paid time it bought goes too: if this was the payment for the
  // church's current period, the church returns to Free now.
  const latest = await db.planPayment.findFirst({
    where: { churchId: req.churchId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest?.id === req.paymentId) {
    await db.subscription.updateMany({
      where: { churchId: req.churchId, status: { not: "grace" } },
      data: {
        plan: "free", status: "active", renewsAt: null, periodStart: null,
        scheduledPlan: null, scheduledAt: null, cancelAtPeriodEnd: false,
      },
    });
  }

  await notifyChurch(
    req.churchId,
    `Your WorshipHQ refund of GHS ${req.amountGhs.toLocaleString()} has been approved and sent to your bank. It usually arrives in 5-10 working days.`,
  );

  revalidatePath("/admin/refunds");
  return { ok: true as const };
}

/** SuperAdmin: decline a refund with a reason. */
export async function rejectRefund(id: string, note: string) {
  await requireSuperAdmin();
  if (!note.trim()) return { ok: false as const, error: "Please give a reason." };

  const updated = await db.refundRequest.updateMany({
    where: { id, status: "pending" },
    data: { status: "rejected", reviewedAt: new Date(), reviewerNote: note.trim() },
  });
  if (updated.count !== 1) return { ok: false as const, error: "This request was already handled." };

  const req = await db.refundRequest.findUnique({ where: { id }, select: { churchId: true } });
  if (req) {
    await notifyChurch(req.churchId, `Your WorshipHQ refund request was not approved. Reason: ${note.trim()}`);
  }

  revalidatePath("/admin/refunds");
  return { ok: true as const };
}

/**
 * Tell the church what happened to its refund, by email and text from the platform. This used to go through
 * the church's OWN SMS credits, so a church with none (very likely, if it is asking for a refund) was never
 * told the outcome and had no way to know.
 */
async function notifyChurch(churchId: string, message: string) {
  try {
    await noticeChurch(churchId, { kind: "refund", title: "Your WorshipHQ refund", sms: `WorshipHQ: ${message}`, paragraphs: [message] });
  } catch {
    /* never block the refund on a notification failure */
  }
}
