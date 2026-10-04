import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { FollowUpsClient } from "@/components/app/follow-ups-client";
import { createFollowUp, saveFollowUpSettings } from "@/app/actions/follow-ups";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus, Settings2 } from "lucide-react";

export const metadata = { title: "Follow-ups" };

const TYPE_OPTIONS = [
  { label: "Task", value: "custom" },
  { label: "Pastoral care", value: "pastoral" },
  { label: "Visitor", value: "new_visitor" },
  { label: "New member", value: "new_member" },
];

export default async function FollowUpsPage() {
  const session = await requireModule("follow-ups");

  const since = new Date(Date.now() - 60 * 86400000);
  const include = {
    person: { select: { firstName: true, lastName: true } },
    visitor: { select: { firstName: true, lastName: true } },
    assignee: { select: { name: true } },
  } as const;

  // Everything still open (never capped by a pile of old finished tasks), plus
  // recently finished ones for the Done tab.
  const [openItems, doneItems, users, church] = await Promise.all([
    db.followUp.findMany({ where: { churchId: session.churchId, status: { not: "done" } }, include, take: 500 }),
    db.followUp.findMany({ where: { churchId: session.churchId, status: "done", completedAt: { gte: since } }, include, orderBy: { completedAt: "desc" }, take: 100 }),
    db.user.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { followUpAssigneeId: true, followUpNewMembers: true } }),
  ]);

  // Most urgent first: soonest due date (overdue naturally leads), undated last.
  const byUrgency = (a: (typeof openItems)[number], b: (typeof openItems)[number]) => {
    const ad = a.dueDate?.getTime() ?? Infinity;
    const bd = b.dueDate?.getTime() ?? Infinity;
    return ad - bd || b.createdAt.getTime() - a.createdAt.getTime();
  };
  const items = [...openItems.sort(byUrgency), ...doneItems];

  return (
    <div>
      <PageHeader title="Follow-ups" description="Make sure every visitor and member is personally cared for, and nobody is forgotten.">
        <ActionDialog
          triggerLabel="Settings"
          triggerIcon={<Settings2 />}
          variant="secondary"
          title="Follow-up settings"
          description="New visitors get a follow-up automatically. Choose who it goes to."
          submitLabel="Save"
          action={saveFollowUpSettings}
          disabled={session.isDemo}
        >
          <Field
            label="Assign new follow-ups to"
            name="assigneeId"
            defaultValue={church?.followUpAssigneeId ?? ""}
            options={[{ label: "Nobody (leave unassigned)", value: "" }, ...users.map((u) => ({ label: u.name, value: u.id }))]}
            hint="They are texted/emailed each time one arrives, and emailed each morning about any that are due or overdue."
          />
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="newMembers" defaultChecked={church?.followUpNewMembers ?? false} className="mt-0.5 size-4 rounded border-line accent-primary" />
            <span>
              Also create a follow-up for every new member who registers themselves
              <span className="mt-0.5 block text-xs text-ink-faint">So someone personally welcomes them. Off by default.</span>
            </span>
          </label>
        </ActionDialog>
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
          <Field label="Type" name="type" options={TYPE_OPTIONS} defaultValue="custom" />
          <Field label="Note" name="note" placeholder="Additional details…" />
          <Field
            label="Assign to"
            name="assigneeId"
            defaultValue=""
            options={[{ label: "Nobody yet", value: "" }, ...users.map((u) => ({ label: u.name, value: u.id }))]}
          />
          <Field label="Due date" name="dueDate" type="date" />
        </ActionDialog>
      </PageHeader>

      <FollowUpsClient
        me={session.userId}
        canWrite={!session.isDemo}
        users={users}
        items={items.map((f) => ({
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
          assigneeId: f.assigneeId,
          assigneeName: f.assignee?.name ?? null,
        }))}
      />
    </div>
  );
}
