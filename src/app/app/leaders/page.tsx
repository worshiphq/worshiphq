import { PageHeader } from "@/components/app/page-header";
import { requireModule } from "@/lib/auth";
import { getLeaders } from "@/lib/data/leaders";
import { LeadersClient } from "@/components/app/leaders-client";

export const metadata = { title: "Leaders" };

export default async function LeadersPage() {
  const session = await requireModule("people");
  const data = await getLeaders(session.churchId);
  const isAdmin = session.role === "Owner" || session.role === "Admin" || session.role === "Pastor";

  return (
    <div>
      <PageHeader
        title="Church Leadership"
        description="Pastors, elders, shepherds, and department heads — everyone who leads your church."
      />
      <LeadersClient
        churchLeaders={data.churchLeaders}
        departmentLeaders={data.departmentLeaders}
        departments={data.departments}
        isAdmin={isAdmin}
        isDemo={session.isDemo}
      />
    </div>
  );
}
