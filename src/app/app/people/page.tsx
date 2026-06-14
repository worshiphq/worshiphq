import { requireSession } from "@/lib/auth";
import { getPeople, getPeopleStats } from "@/lib/data/people";
import { db } from "@/lib/db";
import { PeopleClient } from "@/components/app/people-client";
import { JoinLinkCard } from "@/components/app/join-link-card";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const session = await requireSession();
  const [people, stats, departments, church] = await Promise.all([
    getPeople(session.churchId),
    getPeopleStats(session.churchId),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.church.findUnique({ where: { id: session.churchId }, select: { slug: true, isDemo: true } }),
  ]);
  return (
    <div className="space-y-5">
      {church && !church.isDemo && <JoinLinkCard slug={church.slug} />}
      <PeopleClient
        people={people}
        stats={stats}
        canWrite={!session.isDemo}
        departments={departments}
      />
    </div>
  );
}
