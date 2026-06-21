import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { SermonsClient } from "@/components/app/sermons-client";
import { createSermon } from "@/app/actions/sermons";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Sermons" };

export default async function SermonsPage() {
  const session = await requireModule("events");

  const sermons = await db.sermon.findMany({
    where: { churchId: session.churchId },
    orderBy: { date: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Sermons"
        description="Manage sermon notes, audio, and video for your congregation."
      >
        <ActionDialog
          triggerLabel="Add sermon"
          triggerIcon={<Plus />}
          title="Add sermon"
          description="Record a sermon with notes and media links."
          submitLabel="Save"
          action={createSermon}
          disabled={session.isDemo}
        >
          <Field label="Title" name="title" placeholder="Sermon title" required />
          <Field label="Preacher" name="preacher" placeholder="Pastor name" />
          <Field label="Series" name="series" placeholder="Series name (optional)" />
          <Field label="Scripture" name="scripture" placeholder="e.g. John 3:16" />
          <Field label="Date" name="date" type="date" />
          <Field label="Audio URL" name="audioUrl" placeholder="https://..." />
          <Field label="Video URL" name="videoUrl" placeholder="https://youtube.com/..." />
          <Field label="Notes" name="notes" placeholder="Sermon notes or outline..." />
        </ActionDialog>
      </PageHeader>

      <SermonsClient
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
