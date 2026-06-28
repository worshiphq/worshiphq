import { requireModule } from "@/lib/auth";
import { getPeople, getAllPeopleStats } from "@/lib/data/people";
import { db } from "@/lib/db";
import { PeopleClient } from "@/components/app/people-client";
import { JoinLinkCard } from "@/components/app/join-link-card";
import { PageTips } from "@/components/app/page-tips";
import { getFormDefinition } from "@/lib/forms/registration";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const session = await requireModule("people");
  const [allPeople, stats, departments, church, adults] = await Promise.all([
    getPeople(session.churchId),
    getAllPeopleStats(session.churchId),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true, isDemo: true, registrationFields: true },
    }),
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
  const formFields = getFormDefinition(church?.registrationFields ?? null);
  return (
    <div className="space-y-5">
      <PageTips
        tourId="people"
        steps={[
          { target: "people-invite", title: "Let members register themselves", body: "Share this link (or its QR) so members fill in their own details — they appear in your list automatically." },
          { target: "people-list", title: "Your whole congregation", body: "Search, filter and switch between grid and list. Click anyone to open their full profile, or add a member manually." },
        ]}
      />
      {church && !church.isDemo && (
        <div data-tour="people-invite">
          <JoinLinkCard slug={church.slug} />
        </div>
      )}
      <div data-tour="people-list">
        <PeopleClient
          people={allPeople}
          stats={stats}
          canWrite={!session.isDemo}
          departments={departments}
          formFields={formFields}
          adults={adults}
        />
      </div>
    </div>
  );
}
