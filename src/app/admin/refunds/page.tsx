import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { RefundQueue } from "@/components/admin/refund-queue";
import { db } from "@/lib/db";

export default async function AdminRefundsPage() {
  const sa = await requireSuperAdmin();

  const requests = await db.refundRequest.findMany({
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 300,
    include: {
      church: { select: { name: true } },
      payment: { select: { reference: true, plan: true, interval: true, paidAt: true, kind: true } },
    },
  });

  return (
    <AdminShell email={sa.email}>
      <RefundQueue
        requests={requests.map((r) => ({
          id: r.id,
          churchName: r.church.name,
          amountUsd: r.amountUsd,
          amountGhs: r.amountGhs,
          reason: r.reason,
          status: r.status,
          requestedAt: r.requestedAt.toISOString(),
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          reviewerNote: r.reviewerNote,
          failureReason: r.failureReason,
          plan: r.payment.plan,
          interval: r.payment.interval,
          kind: r.payment.kind,
          reference: r.payment.reference,
          paidAt: r.payment.paidAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
