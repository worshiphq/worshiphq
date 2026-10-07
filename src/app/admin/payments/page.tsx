import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentRequestsManager } from "@/components/admin/payment-requests";
import { db } from "@/lib/db";

export default async function AdminPaymentsPage() {
  const sa = await requireSuperAdmin();
  const [requests, cfg] = await Promise.all([
    db.paymentRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: { church: { select: { name: true, slug: true, paystackSubaccountCode: true } } },
    }),
    db.platformConfig.findUnique({
      where: { id: "default" },
      select: { givingPlatformPercent: true, givingDonorBearsFee: true, paystackFeePercent: true },
    }),
  ]);

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Online Payment Requests</h1>
        <p className="text-sm text-slate-400">
          Churches requesting online payment setup. Review, verify, and create their Paystack subaccounts.
        </p>
      </div>
      <PaymentRequestsManager
        requests={requests}
        fees={{
          platformPercent: cfg?.givingPlatformPercent ?? 0,
          donorBearsFee: cfg?.givingDonorBearsFee ?? true,
          paystackFeePercent: cfg?.paystackFeePercent ?? 1.95,
        }}
      />
    </AdminShell>
  );
}
