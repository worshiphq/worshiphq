import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { GroupsClient } from "@/components/app/groups-client";
import { createGroup } from "@/app/actions/groups";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Groups" };

const GROUP_TYPES = ["small_group", "ministry", "committee", "fellowship"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function GroupsPage() {
  const session = await requireModule("groups");

  const [groups, people] = await Promise.all([
    db.group.findMany({
      where: { churchId: session.churchId },
      include: {
        leader: { select: { firstName: true, lastName: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 500,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Groups" description="Manage small groups, ministries, committees, and fellowships.">
        <ActionDialog
          triggerLabel="New group"
          triggerIcon={<Plus />}
          title="Create group"
          description="Add a new group to your church."
          submitLabel="Create"
          action={createGroup}
          disabled={session.isDemo}
        >
          <Field label="Name" name="name" placeholder="e.g. Youth Fellowship" required />
          <Field label="Type" name="type" options={GROUP_TYPES} />
          <Field label="Description" name="description" placeholder="Brief description..." />
          <Field label="Meeting day" name="meetingDay" options={DAYS} />
          <Field label="Meeting time" name="meetingTime" type="time" />
          <Field label="Location" name="location" placeholder="e.g. Church hall room 3" />
          <Field
            label="Leader"
            name="leaderId"
            options={people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p.id }))}
          />
        </ActionDialog>
      </PageHeader>

      <GroupsClient
        items={groups.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          description: g.description,
          meetingDay: g.meetingDay,
          meetingTime: g.meetingTime,
          location: g.location,
          isActive: g.isActive,
          leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
          memberCount: g._count.members,
        }))}
      />
    </div>
  );
}
