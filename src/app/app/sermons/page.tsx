import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { SermonsClient } from "@/components/app/sermons-client";
import { PageHeader } from "@/components/app/page-header";
import { PendingLink } from "@/components/ui/pending-link";
import { Plus } from "lucide-react";

export const metadata = { title: "Sermons" };

export default async function SermonsPage() {
  const session = await requireModule("sermons");

  const sermons = await db.sermon.findMany({
    where: { churchId: session.churchId },
    orderBy: { date: "desc" },
    take: 1000,
  });

  return (
    <div>
      <PageHeader
        title="Sermons"
        description="Manage sermon notes, audio, and video for your congregation."
      >
        {canEdit(session, "sermons") && (
          <PendingLink href="/app/sermons/new" variant="primary" icon={<Plus />} pendingLabel="Opening…">Add sermon</PendingLink>
        )}
      </PageHeader>

      <SermonsClient
        canWrite={canEdit(session, "sermons")}
        sermons={sermons.map((s) => ({
          id: s.id,
          title: s.title,
          preacher: s.preacher,
          series: s.series,
          scripture: s.scripture,
          notes: s.notes,
          audioUrl: s.audioUrl,
          videoUrl: s.videoUrl,
          published: s.published,
          date: s.date.toISOString(),
        }))}
      />
    </div>
  );
}
