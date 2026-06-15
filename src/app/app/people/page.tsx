import { requireSession } from "@/lib/auth";
import { getPeople, getPeopleStats } from "@/lib/data/people";
import { db } from "@/lib/db";
import { PeopleClient } from "@/components/app/people-client";
import { JoinLinkCard } from "@/components/app/join-link-card";
import { PageTips } from "@/components/app/page-tips";
import { getFormDefinition } from "@/lib/forms/registration";

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
    db.church.findUnique({ where: { id: session.churchId }, select: { slug: true, isDemo: true, registrationFields: true } }),
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
          people={people}
          stats={stats}
          canWrite={!session.isDemo}
          departments={departments}
          formFields={formFields}
        />
      </div>
    </div>
  );
}
