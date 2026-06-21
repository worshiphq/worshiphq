import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { GroupDetailClient } from "@/components/app/group-detail-client";

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
        select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      },
    },
  });

  if (!group) notFound();

  const allPeople = await db.person.findMany({
    where: { churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 500,
  });

  const memberIds = new Set(group.members.map((m) => m.id));
  const available = allPeople.filter((p) => !memberIds.has(p.id));

  return (
    <GroupDetailClient
      group={{
        id: group.id,
        name: group.name,
        type: group.type,
        description: group.description,
        meetingDay: group.meetingDay,
        meetingTime: group.meetingTime,
        location: group.location,
        isActive: group.isActive,
        leader: group.leader
          ? { id: group.leader.id, name: `${group.leader.firstName} ${group.leader.lastName}`, phone: group.leader.phone }
          : null,
      }}
      members={group.members.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        phone: m.phone,
        photoUrl: m.photoUrl,
      }))}
      available={available.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
      }))}
      isDemo={session.isDemo}
    />
  );
}
