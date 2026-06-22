import { requireModule } from "@/lib/auth";
import { getPeople, getChildrenStats } from "@/lib/data/people";
import { db } from "@/lib/db";
import { ChildrenClient } from "@/components/app/children-client";

export const metadata = { title: "Children & Teens" };

export default async function ChildrenPage() {
  const session = await requireModule("people");

  const [children, stats, adults] = await Promise.all([
    getPeople(session.churchId, "children"),
    getChildrenStats(session.churchId),
    db.person.findMany({
      where: {
        churchId: session.churchId,
        OR: [{ ageGroup: null }, { ageGroup: "adult" }],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 500,
    }),
  ]);

  return (
    <ChildrenClient
      people={children}
      stats={stats}
      adults={adults}
      canWrite={!session.isDemo}
    />
  );
}
