import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { querySermons, sermonOptions } from "@/lib/data/lists-a";
import { SermonsClient } from "@/components/app/sermons-client";
import { PageHeader } from "@/components/app/page-header";
import { PendingLink } from "@/components/ui/pending-link";
import { Plus } from "lucide-react";

export const metadata = { title: "Sermons" };

export default async function SermonsPage() {
  const session = await requireModule("sermons");

  const [first, options] = await Promise.all([
    querySermons(session.churchId, "", { preacher: "", series: "", year: "", state: "" }, 1),
    sermonOptions(session.churchId),
  ]);

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
        initial={first}
        options={options}
      />
    </div>
  );
}
