import { PageHeader } from "@/components/app/page-header";
import { requireModule } from "@/lib/auth";
import { getLeaders } from "@/lib/data/leaders";
import { LeadersClient } from "@/components/app/leaders-client";
import { LeaderTitlesManager } from "@/components/app/leader-titles-manager";
import { db } from "@/lib/db";
import { leaderTitleList } from "@/lib/leader-titles";

export const metadata = { title: "Leaders" };

export default async function LeadersPage() {
  const session = await requireModule("leaders");
  let data;
  try {
    data = await getLeaders(session.churchId);
  } catch (err) {
    console.error("[leaders] getLeaders failed:", err);
    throw err;
  }
  const isAdmin = session.role === "Owner" || session.role === "Admin" || session.role === "Pastor";
  const [church, used] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { leaderTitles: true } }),
    db.person.groupBy({ by: ["leaderTitle"], where: { churchId: session.churchId, leaderTitle: { not: null } }, _count: { _all: true } }),
  ]);
  const usage: Record<string, number> = {};
  for (const u of used) if (u.leaderTitle) usage[u.leaderTitle] = u._count._all;

  return (
    <div>
      <PageHeader
        title="Church Leadership"
        description="Pastors, elders, shepherds, and department heads - everyone who leads your church."
      >
        {isAdmin && !session.isDemo && <LeaderTitlesManager initial={leaderTitleList(church?.leaderTitles)} usage={usage} />}
      </PageHeader>
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
