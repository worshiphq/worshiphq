import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { GroupsClient } from "@/components/app/groups-client";
import { createGroup } from "@/app/actions/groups";
import { GroupFields } from "@/components/app/group-fields";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Groups" };

// Suggested types — but any custom text is allowed too.
const GROUP_TYPE_SUGGESTIONS = ["Small group", "Ministry", "Committee", "Fellowship", "Workers", "Choir", "Ushers", "Department"];

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

  const peopleOpts = people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }));

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
          <GroupFields people={peopleOpts} typeSuggestions={GROUP_TYPE_SUGGESTIONS} />
        </ActionDialog>
      </PageHeader>

      <GroupsClient
        canWrite={!session.isDemo}
        people={peopleOpts}
        typeSuggestions={GROUP_TYPE_SUGGESTIONS}
        items={groups.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          description: g.description,
          meetingDays: g.meetingDays.length ? g.meetingDays : g.meetingDay ? [g.meetingDay] : [],
          meetingTime: g.meetingTime,
          location: g.location,
          isActive: g.isActive,
          leaderId: g.leaderId,
          leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
          memberCount: g._count.members,
          meetingReminderOn: g.meetingReminderOn,
          meetingReminderAuto: g.meetingReminderAuto,
          meetingReminderLeadDays: g.meetingReminderLeadDays,
          meetingReminderHour: g.meetingReminderHour,
          meetingReminderText: g.meetingReminderText,
        }))}
      />
    </div>
  );
}
