import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { GroupDetailClient } from "@/components/app/group-detail-client";
import { parseSchedule } from "@/lib/groups/meeting-reminder";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await db.group.findUnique({ where: { id }, select: { name: true } });
  return { title: group?.name ?? "Group" };
}

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireModule("people");

  const group = await db.group.findUnique({
    where: { id, churchId: session.churchId },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true, phone: true } },
      members: {
        select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true, gender: true, status: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      },
    },
  });

  if (!group) notFound();

  const allPeople = await db.person.findMany({
    where: { churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 3000,
  });

  const memberIds = new Set(group.members.map((m) => m.id));
  const schedule = (() => {
    const s = parseSchedule(group.meetingSchedule);
    return s.length ? s : group.meetingDay ? [{ day: group.meetingDay, time: group.meetingTime }] : [];
  })();

  return (
    <GroupDetailClient
      canWrite={canEdit(session, "groups")}
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
      members={group.members.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        phone: m.phone,
        photoUrl: m.photoUrl,
        gender: m.gender,
        inactive: m.status === "inactive",
      }))}
      people={allPeople.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone, member: memberIds.has(p.id) }))}
    />
  );
}
