import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { GroupsClient } from "@/components/app/groups-client";
import { GroupSuggestions } from "@/components/app/group-suggestions";
import { createGroup } from "@/app/actions/groups";
import { GroupFields } from "@/components/app/group-fields";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog } from "@/components/app/action-dialog";
import { nextGroupReminderFromSchedule, parseSchedule } from "@/lib/groups/meeting-reminder";
import { Plus } from "lucide-react";

export const metadata = { title: "Groups" };

// Suggested types - but any custom text is allowed too.
const GROUP_TYPE_SUGGESTIONS = ["Small group", "Ministry", "Committee", "Fellowship", "Workers", "Choir", "Ushers", "Department"];

export default async function GroupsPage() {
  const session = await requireModule("groups");

  const [groups, people, church, inGroups, teenCount, childCount, zoneCount] = await Promise.all([
    db.group.findMany({
      where: { churchId: session.churchId },
      include: {
        leader: { select: { firstName: true, lastName: true } },
        _count: { select: { members: true } },
        members: { take: 4, orderBy: { firstName: "asc" }, select: { firstName: true, lastName: true, photoUrl: true, gender: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 500,
    }),
    db.church.findUnique({ where: { id: session.churchId }, select: { timezone: true } }),
    db.person.count({ where: { churchId: session.churchId, groups: { some: { isActive: true } } } }),
    db.person.count({ where: { churchId: session.churchId, ageGroup: "teen" } }),
    db.person.count({ where: { churchId: session.churchId, ageGroup: "child" } }),
    db.memberCategory.count({ where: { churchId: session.churchId, options: { some: {} } } }),
  ]);

  const peopleOpts = people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }));
  const tz = church?.timezone ?? "Africa/Accra";
  const now = new Date();

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
          disabled={!canEdit(session, "groups")}
        >
          <GroupFields people={peopleOpts} typeSuggestions={GROUP_TYPE_SUGGESTIONS} />
        </ActionDialog>
      </PageHeader>

      <GroupSuggestions existing={groups.map((g) => g.name)} ctx={{ hasTeens: teenCount > 0, hasChildren: childCount > 0 }} canWrite={canEdit(session, "groups")} hasZones={zoneCount > 0} />

      <GroupsClient
        canWrite={canEdit(session, "groups")}
        stats={{
          groups: groups.length,
          inGroups,
          onForms: groups.filter((g) => g.onForms).length,
          meetingThisWeek: groups.filter((g) => g.isActive && (parseSchedule(g.meetingSchedule).length > 0 || !!g.meetingDay)).length,
        }}
        people={peopleOpts}
        typeSuggestions={GROUP_TYPE_SUGGESTIONS}
        items={groups.map((g) => {
          let schedule = parseSchedule(g.meetingSchedule);
          if (schedule.length === 0 && g.meetingDay) schedule = [{ day: g.meetingDay, time: g.meetingTime }];
          const days = schedule.map((s) => s.day);
          return {
            id: g.id,
            name: g.name,
            type: g.type,
            description: g.description,
            schedule,
            meetingDays: days,
            location: g.location,
            isActive: g.isActive,
            onForms: g.onForms,
            leaderId: g.leaderId,
            leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
            memberCount: g._count.members,
            preview: g.members.map((m) => ({ name: `${m.firstName} ${m.lastName}`.trim(), photoUrl: m.photoUrl, gender: m.gender })),
            meetingReminderOn: g.meetingReminderOn,
            meetingReminderAuto: g.meetingReminderAuto,
            meetingReminderLeadDays: g.meetingReminderLeadDays,
            meetingReminderHour: g.meetingReminderHour,
            meetingReminderMinute: g.meetingReminderMinute,
            meetingReminderWeekday: g.meetingReminderWeekday,
            meetingReminderText: g.meetingReminderText,
            nextReminderLabel:
              g.meetingReminderOn && g.meetingReminderAuto
                ? nextGroupReminderFromSchedule({ schedule, defaults: { leadDays: g.meetingReminderLeadDays, hour: g.meetingReminderHour, minute: g.meetingReminderMinute, weekday: g.meetingReminderWeekday }, timezone: tz, now })
                : null,
          };
        })}
      />
    </div>
  );
}
