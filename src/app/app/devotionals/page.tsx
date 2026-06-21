import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { DevotionalsClient } from "@/components/app/devotionals-client";
import { createDevotional } from "@/app/actions/devotionals";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Devotionals" };

export default async function DevotionalsPage() {
  const session = await requireModule("communications");

  const devotionals = await db.devotional.findMany({
    where: { churchId: session.churchId },
    orderBy: { date: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Devotionals"
        description="Share daily devotionals and Bible study notes with your congregation."
      >
        <ActionDialog
          triggerLabel="Add devotional"
          triggerIcon={<Plus />}
          title="Add devotional"
          description="Write a devotional or Bible study note to share."
          submitLabel="Save"
          action={createDevotional}
          disabled={session.isDemo}
        >
          <Field label="Title" name="title" placeholder="Devotional title" required />
          <Field label="Scripture" name="scripture" placeholder="e.g. Psalm 23:1-6" />
          <Field label="Author" name="author" placeholder="Writer's name" />
          <Field label="Date" name="date" type="date" />
          <Field label="Body" name="body" placeholder="Write your devotional here..." required />
        </ActionDialog>
      </PageHeader>

      <DevotionalsClient
        devotionals={devotionals.map((d) => ({
          id: d.id,
          title: d.title,
          scripture: d.scripture,
          body: d.body,
          author: d.author,
          published: d.published,
          date: d.date.toISOString(),
        }))}
      />
    </div>
  );
}
