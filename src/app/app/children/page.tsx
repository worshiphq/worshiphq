import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { queryPeople, getChildrenStats } from "@/lib/data/people";
import { db } from "@/lib/db";
import { ChildrenClient } from "@/components/app/children-client";

export const metadata = { title: "Children & Teens" };

export default async function ChildrenPage() {
  const session = await requireModule("people");

  const [children, stats] = await Promise.all([
    queryPeople(session.churchId, { tab: "kids", page: 1 }),
    getChildrenStats(session.churchId),
  ]);

  return (
    <ChildrenClient
      initial={children}
      stats={stats}
      canWrite={canEdit(session, "people")}
    />
  );
}
