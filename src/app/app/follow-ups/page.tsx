import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { FollowUpsClient } from "@/components/app/follow-ups-client";
import { createFollowUp } from "@/app/actions/follow-ups";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const session = await requireModule("people");

  const [followUps, users] = await Promise.all([
    db.followUp.findMany({
      where: { churchId: session.churchId },
      include: {
        person: { select: { firstName: true, lastName: true } },
        visitor: { select: { firstName: true, lastName: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.user.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Follow-ups" description="Track pastoral care, visitor follow-ups, and tasks for your team.">
        <ActionDialog
          triggerLabel="New follow-up"
          triggerIcon={<Plus />}
          title="Create follow-up"
          description="Add a pastoral care or visitor follow-up task."
          submitLabel="Create"
          action={createFollowUp}
          disabled={session.isDemo}
        >
          <Field label="Title" name="title" placeholder="Call visitor John" required />
          <Field label="Type" name="type" options={["new_visitor", "new_member", "pastoral", "custom"]} />
          <Field label="Note" name="note" placeholder="Additional details…" />
          <Field
            label="Assign to"
            name="assigneeId"
            options={users.map((u) => ({ label: u.name, value: u.id }))}
          />
          <Field label="Due date" name="dueDate" type="date" />
        </ActionDialog>
      </PageHeader>

      <FollowUpsClient
        items={followUps.map((f) => ({
          id: f.id,
          title: f.title,
          type: f.type,
          note: f.note,
          status: f.status,
          dueDate: f.dueDate?.toISOString() ?? null,
          completedAt: f.completedAt?.toISOString() ?? null,
          createdAt: f.createdAt.toISOString(),
          personName: f.person ? `${f.person.firstName} ${f.person.lastName}` : null,
          visitorName: f.visitor ? `${f.visitor.firstName} ${f.visitor.lastName}` : null,
          assigneeName: f.assignee?.name ?? null,
        }))}
      />
    </div>
  );
}
