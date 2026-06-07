import { PageHeader } from "@/components/app/page-header";
import { SettingsClient } from "@/components/app/settings-client";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { features } from "@/lib/env";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();

  const [church, users, departments] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId } }),
    db.user.findMany({
      where: { churchId: session.churchId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const churchData = church
    ? {
        name: church.name,
        denomination: church.denomination ?? "",
        city: church.city ?? "",
        country: church.country ?? "Ghana",
        address: church.address ?? "",
        accentColor: church.accentColor ?? "#5b43db",
        logoUrl: church.logoUrl ?? "",
        slug: church.slug,
        registrationFields: (church.registrationFields as Record<string, boolean> | null) ?? null,
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
      />
    </div>
  );
}
