import { requireSession } from "@/lib/auth";
import { getPeople, getPeopleStats } from "@/lib/data/people";
import { db } from "@/lib/db";
import { PeopleClient } from "@/components/app/people-client";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const session = await requireSession();
  const [people, stats, departments] = await Promise.all([
    getPeople(session.churchId),
    getPeopleStats(session.churchId),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <PeopleClient
      people={people}
      stats={stats}
      canWrite={!session.isDemo}
      departments={departments}
    />
  );
}
