import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServiceRoles } from "@/lib/data/rosters";
import { getSmsBalance } from "@/lib/sms/credits";
import { RostersClient } from "@/components/app/rosters-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Rosters" };

export default async function RostersPage() {
  const session = await requireModule("volunteers");

  const [sheets, members, roles, smsBalance] = await Promise.all([
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
  ]);

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
        canWrite={!session.isDemo}
      />
    </div>
  );
}
