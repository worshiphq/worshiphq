"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, requireSuperAdmin } from "@/lib/auth";
import { refundEligibility, getRefundPolicy } from "@/lib/billing/refunds";
import { refundTransaction } from "@/lib/integrations/paystack";
import { sendChurchSms } from "@/lib/sms/credits";

/** Church side: check whether a payment can still be refunded. */
export async function checkRefundEligibility(paymentId: string) {
  const session = await requireSession();
  const [result, policy] = await Promise.all([
    refundEligibility(paymentId, session.churchId),
    getRefundPolicy(),
  ]);
  return {
    ...result,
    deadline: result.deadline?.toISOString() ?? null,
    slaHours: policy.slaHours,
  };
}

/** Church side: submit a refund request for review. */
export async function requestRefund(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner") return { ok: false as const, error: "Only the church owner can request a refund." };

  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const accepted = formData.get("accepted") === "on";
  if (!accepted) return { ok: false as const, error: "Please confirm you've read the refund policy." };
  if (reason.length < 10) return { ok: false as const, error: "Please tell us briefly why you're requesting a refund." };

  const eligibility = await refundEligibility(paymentId, session.churchId);
  if (!eligibility.eligible) return { ok: false as const, error: eligibility.reason ?? "This payment can't be refunded." };

  const payment = await db.planPayment.findFirst({
    where: { id: paymentId, churchId: session.churchId },
    select: { id: true, amountUsd: true, amountGhs: true },
  });
  if (!payment) return { ok: false as const, error: "Payment not found." };

  await db.refundRequest.create({
    data: {
      churchId: session.churchId,
      paymentId: payment.id,
      amountUsd: payment.amountUsd,
      amountGhs: payment.amountGhs,
      reason,
      requestedByUserId: session.userId,
    },
  });

  const policy = await getRefundPolicy();
  revalidatePath("/app/settings");
  return {
    ok: true as const,
    message: `Request received. We review refunds within ${policy.slaHours} hours; if approved, your bank typically receives it in 5–10 working days.`,
  };
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

async function notifyChurch(churchId: string, message: string) {
  try {
    const owner = await db.user.findFirst({
      where: { churchId, role: "Owner", phone: { not: null } },
      select: { phone: true },
    });
    if (owner?.phone) await sendChurchSms(churchId, owner.phone, message, { note: "Refund" });
  } catch {
    /* never block the refund on a notification failure */
  }
}
