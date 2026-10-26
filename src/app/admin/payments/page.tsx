import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentRequestsManager } from "@/components/admin/payment-requests";
import { db } from "@/lib/db";
import { getGivingSettings } from "@/lib/giving/settings";

export default async function AdminPaymentsPage() {
  const sa = await requireSuperAdmin();
  const [requests, cfg] = await Promise.all([
    db.paymentRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: { church: { select: { name: true, slug: true, paystackSubaccountCode: true, givingBlocked: true } } },
    }),
    db.platformConfig.findUnique({
      where: { id: "default" },
      select: { givingPlatformPercent: true, givingDonorBearsFee: true, paystackFeePercent: true },
    }),
  ]);

  // How each church's giving fees work right now (its own choice, or the platform default).
  const settings = await Promise.all(requests.map((r) => getGivingSettings(r.churchId)));
  const withGiving = requests.map((r, i) => ({ ...r, giving: { mode: settings[i].mode, platformPercent: settings[i].platformPercent, custom: settings[i].custom, customPercent: settings[i].customPercent } }));

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Online Payment Requests</h1>
        <p className="text-sm text-slate-400">
          Churches requesting online payment setup. Review, verify, and create their Paystack subaccounts.
        </p>
      </div>
      <PaymentRequestsManager
        requests={withGiving}
        fees={{
          platformPercent: cfg?.givingPlatformPercent ?? 0,
          donorBearsFee: cfg?.givingDonorBearsFee ?? true,
          paystackFeePercent: cfg?.paystackFeePercent ?? 1.95,
        }}
      />
    </AdminShell>
  );
}
