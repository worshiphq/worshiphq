import { requireModule } from "@/lib/auth";
import { queryAudit, auditOptions } from "@/lib/data/lists-a";
import { AuditLogClient } from "@/components/app/audit-log-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage() {
  const session = await requireModule("audit-log");

  const [first, options] = await Promise.all([
    queryAudit(session.churchId, "", { entity: "", action: "", user: "", fromMs: null, toMs: null }, 1),
    auditOptions(session.churchId),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="A record of all actions performed in your church account."
      />
      <AuditLogClient
        initial={first}
        options={options}
      />
    </div>
  );
}
