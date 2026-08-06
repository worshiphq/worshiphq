import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServiceRoles } from "@/lib/data/rosters";
import { getSmsBalance } from "@/lib/sms/credits";
import { RostersClient } from "@/components/app/rosters-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Rosters" };

export default async function RostersPage() {
  const session = await requireModule("volunteers");

  const [sheets, members, roles, smsBalance, church] = await Promise.all([
    db.volunteerRoster.findMany({
      where: { churchId: session.churchId },
      orderBy: { startDate: "desc" },
      include: {
        slots: {
          orderBy: { createdAt: "asc" },
          include: { person: { select: { firstName: true, lastName: true, phone: true } } },
        },
      },
    }),
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "inactive" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, phone: true },
    }),
    getServiceRoles(session.churchId),
    getSmsBalance(session.churchId),
    db.church.findUnique({
      where: { id: session.churchId },
      select: {
        messageTemplates: true, timezone: true, rosterAnnounceOn: true, rosterAnnounceAudience: true,
        rosterAnnounceGroupId: true, rosterAnnounceLeadDays: true, rosterAnnounceHour: true,
      },
    }),
  ]);
  const messageTemplates = (church?.messageTemplates as Record<string, string> | null) ?? {};
  const groups = await db.group.findMany({
    where: { churchId: session.churchId },
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Rosters"
        description="Set who serves at each service — Word, prayer, praise & worship — then share it or text everyone their duty."
      />

      <RostersClient
        sheets={sheets.map((s) => ({
          id: s.id,
          service: s.name,
          date: s.startDate.toISOString(),
          assignments: s.slots.map((sl) => ({
            id: sl.id,
            role: sl.role,
            personId: sl.personId,
            personName: sl.personName ?? (sl.person ? `${sl.person.firstName} ${sl.person.lastName}` : null),
            hasPhone: !!sl.person?.phone,
            notified: !!sl.notifiedAt,
          })),
        }))}
        members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), hasPhone: !!m.phone }))}
        roles={roles}
        smsBalance={smsBalance}
        messageTemplates={messageTemplates}
        groups={groups.map((g) => ({ id: g.id, name: g.name, memberCount: g._count.members }))}
        announce={{
          on: church?.rosterAnnounceOn ?? false,
          audience: church?.rosterAnnounceAudience ?? "group",
          groupId: church?.rosterAnnounceGroupId ?? null,
          leadDays: church?.rosterAnnounceLeadDays ?? 2,
          hour: church?.rosterAnnounceHour ?? 8,
          timezone: church?.timezone ?? "Africa/Accra",
        }}
        canWrite={!session.isDemo}
      />
    </div>
  );
}
