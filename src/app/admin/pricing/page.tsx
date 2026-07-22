import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { PlanEditor } from "@/components/admin/plan-editor";
import { CouponManager } from "@/components/admin/coupon-manager";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { db } from "@/lib/db";

export default async function AdminPricingPage() {
  const sa = await requireSuperAdmin();
  const [config, coupons, churches] = await Promise.all([
    getPlatformConfig(),
    db.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: { church: { select: { name: true } } },
      take: 200,
    }),
    db.church.findMany({
      where: { isDemo: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AdminShell email={sa.email}>
      <PlanEditor
        currency={config.currency}
        currencySymbol={config.currencySymbol}
        usdToGhsRate={config.usdToGhsRate}
        planList={config.planList}
      />

      <CouponManager
        currencySymbol={config.currencySymbol}
        churches={churches}
        coupons={coupons.map((c) => ({
          id: c.id,
          code: c.code,
          discountType: c.discountType,
          discountValue: c.discountValue,
          plan: c.plan,
          interval: c.interval,
          churchName: c.church?.name ?? null,
          note: c.note,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          usedAt: c.usedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
