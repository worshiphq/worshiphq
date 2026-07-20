import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PlanEditor } from "@/components/admin/plan-editor";
import { getPlatformConfig } from "@/lib/data/platform-config";

export default async function AdminPricingPage() {
  const sa = await requireSuperAdmin();
  const config = await getPlatformConfig();

  return (
    <AdminShell email={sa.email}>
      <PlanEditor
        currency={config.currency}
        currencySymbol={config.currencySymbol}
        usdToGhsRate={config.usdToGhsRate}
        planList={config.planList}
      />
    </AdminShell>
  );
}
