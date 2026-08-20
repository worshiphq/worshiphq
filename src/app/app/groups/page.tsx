import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { GroupsClient } from "@/components/app/groups-client";
import { createGroup } from "@/app/actions/groups";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Groups" };

// Suggested types — but any custom text is allowed too.
const GROUP_TYPE_SUGGESTIONS = ["Small group", "Ministry", "Committee", "Fellowship", "Workers", "Choir", "Ushers", "Department"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_OPTIONS = [{ label: "— No set day —", value: "" }, ...DAYS.map((d) => ({ label: d, value: d }))];

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
          <Field label="Type" name="type" suggestions={GROUP_TYPE_SUGGESTIONS} placeholder="Pick one or type your own" hint="e.g. Small group, Workers, Choir — anything you like" />
          <Field label="Description" name="description" placeholder="Brief description..." />
          <Field label="Meeting day" name="meetingDay" options={DAY_OPTIONS} hint="Optional — leave as “No set day” for a general group" />
          <Field label="Meeting time" name="meetingTime" type="time" />
          <Field label="Location" name="location" placeholder="e.g. Church hall room 3" />
          <Field
            label="Leader"
            name="leaderId"
            options={[{ label: "— No leader —", value: "" }, ...people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p.id }))]}
            hint="Optional — some groups don’t have a leader"
          />
        </ActionDialog>
      </PageHeader>

      <GroupsClient
        canWrite={!session.isDemo}
        people={people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }))}
        typeSuggestions={GROUP_TYPE_SUGGESTIONS}
        dayOptions={DAY_OPTIONS}
        items={groups.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          description: g.description,
          meetingDay: g.meetingDay,
          meetingTime: g.meetingTime,
          location: g.location,
          isActive: g.isActive,
          leaderId: g.leaderId,
          leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
          memberCount: g._count.members,
        }))}
      />
    </div>
  );
}
