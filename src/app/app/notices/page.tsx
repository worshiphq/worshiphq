import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { NoticesClient } from "@/components/app/notices-client";
import { createNotice } from "@/app/actions/notices";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Notices" };

export default async function NoticesPage() {
  const session = await requireModule("notices");

  const notices = await db.churchNotice.findMany({
    where: { churchId: session.churchId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Notice board" description="Post announcements and updates for your church leadership team.">
        <ActionDialog
          triggerLabel="New notice"
          triggerIcon={<Plus />}
          title="Post notice"
          description="Create an announcement visible to all team members."
          submitLabel="Post"
          action={createNotice}
          disabled={session.isDemo}
        >
          <Field label="Title" name="title" placeholder="e.g. Church cleanup this Saturday" required />
          <Field label="Body" name="body" placeholder="Details..." required />
          <Field label="Pin to top" name="pinned" type="checkbox" />
        </ActionDialog>
      </PageHeader>

      <NoticesClient
        items={notices.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          pinned: n.pinned,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
