import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DevotionalsClient } from "@/components/app/devotionals-client";
import { PageHeader } from "@/components/app/page-header";
import { PendingLink } from "@/components/ui/pending-link";
import { audienceOptions } from "@/lib/sms/audience";
import { Plus } from "lucide-react";

export const metadata = { title: "Devotionals" };

export default async function DevotionalsPage() {
  const session = await requireModule("devotionals");

  const [devotionals, audiences] = await Promise.all([
    db.devotional.findMany({
      where: { churchId: session.churchId },
      orderBy: { date: "desc" },
      take: 1000,
    }),
    audienceOptions(session.churchId),
  ]);

  return (
    <div>
      <PageHeader
        title="Devotionals"
        description="Write devotionals and Bible study notes, and text them to your church."
      >
        {canEdit(session, "devotionals") && (
          <PendingLink href="/app/devotionals/new" variant="primary" icon={<Plus />} pendingLabel="Opening…">Add devotional</PendingLink>
        )}
      </PageHeader>

      <DevotionalsClient
        canWrite={canEdit(session, "devotionals")}
        audiences={audiences}
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
