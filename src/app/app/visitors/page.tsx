import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { VisitorsClient } from "@/components/app/visitors-client";
import { queryVisitors, visitorCounts } from "@/lib/data/visitors";

export const metadata = { title: "Visitors" };

export default async function VisitorsPage() {
  const session = await requireModule("visitors");

  const [first, church, members, counts] = await Promise.all([
    queryVisitors(session.churchId, "", false, 1),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true, isDemo: true },
    }),
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "inactive" } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: { firstName: "asc" },
      take: 2000,
    }),
    visitorCounts(session.churchId),
  ]);

  const visitUrl = church?.slug && !church.isDemo
    ? `/visit/${church.slug}`
    : null;

  const canWrite = canEdit(session, "visitors");

  return (
    <VisitorsClient
      initial={first}
      counts={counts}
      members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), phone: m.phone }))}
      visitUrl={visitUrl}
      canWrite={canWrite}
    />
  );
}
