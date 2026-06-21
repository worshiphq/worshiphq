import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuditLogClient } from "@/components/app/audit-log-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage() {
  const session = await requireModule("settings");

  const logs = await db.auditLog.findMany({
    where: { churchId: session.churchId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="A record of all actions performed in your church account."
      />
      <AuditLogClient
        logs={logs.map((l) => ({
          id: l.id,
          action: l.action,
          entity: l.entity,
          entityId: l.entityId,
          detail: l.detail,
          userName: l.user.name,
          userEmail: l.user.email,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
