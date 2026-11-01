import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentRequestsManager } from "@/components/admin/payment-requests";
import { CollectionsSwitch } from "@/components/admin/collections-switch";
import { NotifyGivingPause } from "@/components/admin/notify-giving-pause";
import { db } from "@/lib/db";
import { getGivingSettings } from "@/lib/giving/settings";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { getCollectionProvider } from "@/lib/billing/collection-provider";
import { features } from "@/lib/env";

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

  const collectionProvider = await getCollectionProvider();
  const platform = await getPlatformConfig();
  const planPercents = Object.fromEntries(platform.planList.map((p) => [p.id, p.givingPercent])) as Record<string, number>;
  const planCaps = Object.fromEntries(platform.planList.map((p) => [p.id, p.givingCap])) as Record<string, number>;
  const planNames = Object.fromEntries(platform.planList.map((p) => [p.id, p.name])) as Record<string, string>;

  // How each church's giving fees work right now (its own choice, or the platform default).
  const settings = await Promise.all(requests.map((r) => getGivingSettings(r.churchId)));
  const withGiving = requests.map((r, i) => ({ ...r, giving: { mode: settings[i].mode, platformPercent: settings[i].platformPercent, custom: settings[i].custom, customPercent: settings[i].customPercent, planName: settings[i].planName } }));

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Online Payment Requests</h1>
        <p className="text-sm text-slate-400">
          Churches requesting online payment setup. Review, verify, and create their Paystack subaccounts.
        </p>
      </div>
      <CollectionsSwitch current={collectionProvider} hubtelReady={features.hubtelPay} />
      <NotifyGivingPause waiting={requests.filter((r) => ["pending", "scheduled", "in_progress"].includes(r.status)).length} />
      <PaymentRequestsManager
        requests={withGiving}
        planPercents={planPercents}
        planCaps={planCaps}
        planNames={planNames}
        fees={{
          platformPercent: cfg?.givingPlatformPercent ?? 0,
          donorBearsFee: cfg?.givingDonorBearsFee ?? true,
          paystackFeePercent: cfg?.paystackFeePercent ?? 1.95,
        }}
      />
    </AdminShell>
  );
}
