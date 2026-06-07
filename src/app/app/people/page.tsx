import { requireSession } from "@/lib/auth";
import { getPeople, getPeopleStats } from "@/lib/data/people";
import { PeopleClient } from "@/components/app/people-client";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const session = await requireSession();
  const [people, stats] = await Promise.all([
    getPeople(session.churchId),
    getPeopleStats(session.churchId),
  ]);
  return <PeopleClient people={people} stats={stats} canWrite={!session.isDemo} />;
}
