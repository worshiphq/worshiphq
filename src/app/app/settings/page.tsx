import { PageHeader } from "@/components/app/page-header";
import { SettingsClient } from "@/components/app/settings-client";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { features } from "@/lib/env";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireModule("settings");

  const [church, users, departments, customRoles, subscription] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId } }),
    db.user.findMany({
      where: { churchId: session.churchId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, customRole: { select: { id: true, name: true } } },
    }),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.customRole.findMany({
      where: { churchId: session.churchId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sections: true, canDelete: true },
    }),
    db.subscription.findUnique({
      where: { churchId: session.churchId },
      select: { plan: true, status: true, interval: true, renewsAt: true, bypassPlan: true },
    }),
  ]);

  // Auto-provision subscription for churches created before subscriptions existed
  let sub = subscription;
  if (!sub && church) {
    const owner = users.find((u) => u.role === "Owner");
    const isGrace = owner?.email?.toLowerCase() === "theophanyhouse@gmail.com";
    sub = await db.subscription.create({
      data: {
        churchId: church.id,
        plan: isGrace ? "max" : "free",
        interval: "monthly",
        status: isGrace ? "grace" : "active",
      },
      select: { plan: true, status: true, interval: true, renewsAt: true, bypassPlan: true },
    });
  }

  const churchData = church
    ? {
      name: church.name,
      denomination: church.denomination ?? "",
      city: church.city ?? "",
      country: church.country ?? "Ghana",
      address: church.address ?? "",
      accentColor: church.accentColor ?? "#0d7377",
      logoUrl: church.logoUrl ?? "",
      slug: church.slug,
      registrationFields: (church.registrationFields as Record<string, boolean> | null) ?? null,
      visitorFormFields: church.visitorFormFields ?? null,

      smsSenderId: church.smsSenderId,
      smsSenderIdStatus: church.smsSenderIdStatus,
      smsSenderIdRequestedAt: church.smsSenderIdRequestedAt,
      rolePermissions: (church.rolePermissions as Record<string, string[]> | null) ?? null,
    }
    : null;

  return (
    <div>
      <PageHeader title="Settings" description="Church profile, branding, team, billing and integrations." />
      <SettingsClient
        session={session}
        features={{ ...features }}
        church={churchData}
        users={users}
        departments={departments}
        customRoles={customRoles}
        subscription={sub}
      />
    </div>
  );
}
