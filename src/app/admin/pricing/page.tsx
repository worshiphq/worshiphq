import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { getPlatformConfig } from "@/lib/data/platform-config";

export default async function AdminPricingPage() {
  const sa = await requireSuperAdmin();
  const config = await getPlatformConfig();

  return (
    <AdminShell email={sa.email}>
      <PricingEditor
        currency={config.currency}
        currencySymbol={config.currencySymbol}
        prices={config.prices}
      />
    </AdminShell>
  );
}
