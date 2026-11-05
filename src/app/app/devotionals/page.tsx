import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DevotionalsClient } from "@/components/app/devotionals-client";
import { PageHeader } from "@/components/app/page-header";
import { PendingLink } from "@/components/ui/pending-link";
import { audienceOptions } from "@/lib/sms/audience";
import { Plus } from "lucide-react";
import { queryDevotionals, devotionalOptions } from "@/lib/data/lists-a";

export const metadata = { title: "Devotionals" };

export default async function DevotionalsPage() {
  const session = await requireModule("devotionals");

  const [first, options, audiences] = await Promise.all([
    queryDevotionals(session.churchId, "", { author: "", year: "", state: "" }, 1),
    devotionalOptions(session.churchId),
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
        initial={first}
        options={options}
      />
    </div>
  );
}
