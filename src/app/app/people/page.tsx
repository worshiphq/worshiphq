import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { getPeople, getAllPeopleStats } from "@/lib/data/people";
import Link from "next/link";
import { db } from "@/lib/db";
import { PeopleClient } from "@/components/app/people-client";
import { JoinLinkCard } from "@/components/app/join-link-card";
import { PageTips } from "@/components/app/page-tips";
import { getFormDefinition, questionFields } from "@/lib/forms/registration";
import { getCategoriesForForm } from "@/lib/members/categories";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const session = await requireModule("people");
  const [allPeople, stats, departments, church, adults, categories, groups, waiting] = await Promise.all([
    getPeople(session.churchId),
    getAllPeopleStats(session.churchId),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true, isDemo: true, registrationFields: true, ageTeenMax: true, ageYouthOn: true, ageYouthMax: true, ageYouthLabel: true },
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
    getCategoriesForForm(session.churchId),
    db.group.findMany({ where: { churchId: session.churchId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.personTransfer.count({ where: { toChurchId: session.churchId, status: "pending" } }),
  ]);
  const formFields = questionFields(getFormDefinition(church?.registrationFields ?? null));
  return (
    <div className="space-y-5">
      <PageTips
        tourId="people"
        steps={[
          { target: "people-invite", title: "Let members register themselves", body: "Share this link (or its QR) so members fill in their own details - they appear in your list automatically." },
          { target: "people-list", title: "Your whole congregation", body: "Search, filter and switch between grid and list. Click anyone to open their full profile, or add a member manually." },
        ]}
      />
      {waiting > 0 && (
        <Link href="/app/settings?tab=linked" className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span><b>{waiting}</b> {waiting === 1 ? "person is" : "people are"} waiting to join from a linked church.</span>
          <span className="font-semibold text-primary">Review</span>
        </Link>
      )}
      {church && !church.isDemo && (
        <div data-tour="people-invite">
          <JoinLinkCard slug={church.slug} />
        </div>
      )}
      <div data-tour="people-list">
        <PeopleClient
          people={allPeople}
          stats={stats}
          canWrite={canEdit(session, "people")}
          departments={departments}
          groups={groups}
          formFields={formFields}
          adults={adults}
          categories={categories}
          initialQuery={q ?? ""}
          youth={church?.ageYouthOn ? { label: church.ageYouthLabel, min: church.ageTeenMax + 1, max: church.ageYouthMax } : null}
        />
      </div>
    </div>
  );
}
