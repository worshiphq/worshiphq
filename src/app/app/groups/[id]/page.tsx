import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { requireModule, planLockFor } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { GroupDetailClient } from "@/components/app/group-detail-client";
import { queryGroupMembers, groupMemberIds } from "@/lib/data/lists-b";
import { parseSchedule } from "@/lib/groups/meeting-reminder";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await db.group.findUnique({ where: { id }, select: { name: true } });
  return { title: group?.name ?? "Group" };
}

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireModule("people");
  // A group is opened with the People permission, so the plan lock for Groups is checked here as well.
  if (planLockFor(session, "groups")) redirect("/app/settings?tab=billing");

  const group = await db.group.findUnique({
    where: { id, churchId: session.churchId },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });

  if (!group) notFound();

  const allPeople = await db.person.findMany({
    where: { churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 3000,
  });

  const [first, memberIdList, me, churchSettings] = await Promise.all([
    queryGroupMembers(session.churchId, group.id, "", 1),
    groupMemberIds(group.id),
    db.user.findUnique({ where: { id: session.userId }, select: { personId: true } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { leaderMessagingOn: true } }),
  ]);
  const iLead = !!churchSettings?.leaderMessagingOn && !!me?.personId && me.personId === group.leaderId;
  const memberIds = new Set(memberIdList);
  const schedule = (() => {
    const s = parseSchedule(group.meetingSchedule);
    return s.length ? s : group.meetingDay ? [{ day: group.meetingDay, time: group.meetingTime }] : [];
  })();

  return (
    <GroupDetailClient
      canWrite={canEdit(session, "groups")}
      leaderOf={iLead ? [group.id] : []}
      group={{
        id: group.id,
        name: group.name,
        type: group.type,
        description: group.description,
        schedule,
        meetingDays: schedule.map((s) => s.day),
        location: group.location,
        isActive: group.isActive,
        onForms: group.onForms,
        leaderId: group.leaderId,
        leader: group.leader
          ? { id: group.leader.id, name: `${group.leader.firstName} ${group.leader.lastName}`, phone: group.leader.phone }
          : null,
        meetingReminderOn: group.meetingReminderOn,
        meetingReminderAuto: group.meetingReminderAuto,
        meetingReminderLeadDays: group.meetingReminderLeadDays,
        meetingReminderHour: group.meetingReminderHour,
        meetingReminderMinute: group.meetingReminderMinute,
        meetingReminderWeekday: group.meetingReminderWeekday,
        meetingReminderText: group.meetingReminderText,
      }}
      initial={first}
      people={allPeople.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone, member: memberIds.has(p.id) }))}
    />
  );
}
