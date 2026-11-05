import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { VisitorsClient } from "@/components/app/visitors-client";
import { queryVisitors, visitorCounts } from "@/lib/data/visitors";

export const metadata = { title: "Visitors" };

export default async function VisitorsPage() {
  const session = await requireModule("visitors");

  const [first, church, counts] = await Promise.all([
    queryVisitors(session.churchId, "", false, 1),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true, isDemo: true },
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
      visitUrl={visitUrl}
      canWrite={canWrite}
    />
  );
}
