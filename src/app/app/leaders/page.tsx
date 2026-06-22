import { PageHeader } from "@/components/app/page-header";
import { requireModule } from "@/lib/auth";
import { getLeaders } from "@/lib/data/leaders";
import { LeadersClient } from "@/components/app/leaders-client";

export const metadata = { title: "Leaders" };

export default async function LeadersPage() {
  const session = await requireModule("people");
  let data;
  try {
    data = await getLeaders(session.churchId);
  } catch (err) {
    console.error("[leaders] getLeaders failed:", err);
    throw err;
  }
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
        people={data.people}
        customPositions={data.customPositions}
        isAdmin={isAdmin}
        isDemo={session.isDemo}
      />
    </div>
  );
}
