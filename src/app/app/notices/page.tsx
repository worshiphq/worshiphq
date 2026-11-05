import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { queryNotices } from "@/lib/data/lists-a";
import { NoticesClient } from "@/components/app/notices-client";
import { createNotice } from "@/app/actions/notices";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Notices" };

export default async function NoticesPage() {
  const session = await requireModule("notices");

  const first = await queryNotices(session.churchId, "", 1);

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
          disabled={!canEdit(session, "notices")}
        >
          <Field label="Title" name="title" placeholder="e.g. Church cleanup this Saturday" required />
          <Field label="Body" name="body" placeholder="Details..." required />
          <Field label="Pin to top" name="pinned" type="checkbox" />
        </ActionDialog>
      </PageHeader>

      <NoticesClient initial={first} />
    </div>
  );
}
