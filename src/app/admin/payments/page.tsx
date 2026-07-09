import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentRequestsManager } from "@/components/admin/payment-requests";
import { db } from "@/lib/db";

export default async function AdminPaymentsPage() {
  const sa = await requireSuperAdmin();
  const requests = await db.paymentRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { church: { select: { name: true, slug: true } } },
  });

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Online Payment Requests</h1>
        <p className="text-sm text-slate-400">
          Churches requesting online payment setup. Review, schedule meetings, and set up their accounts.
        </p>
      </div>
      <PaymentRequestsManager requests={requests} />
    </AdminShell>
  );
}
