import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServiceRoles } from "@/lib/data/rosters";
import { getSmsBalance } from "@/lib/sms/credits";
import { RostersClient } from "@/components/app/rosters-client";
import { createRoster } from "@/app/actions/rosters";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Rosters" };

export default async function RostersPage() {
  const session = await requireModule("volunteers");

  const [rosters, members, roles, smsBalance] = await Promise.all([
    db.volunteerRoster.findMany({
      where: { churchId: session.churchId },
      orderBy: { startDate: "desc" },
      include: {
        slots: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
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
        description="Plan who serves at each service — Word, prayer, praise & worship, and more — then share it or text everyone."
      >
        <ActionDialog
          triggerLabel="New roster"
          triggerIcon={<Plus />}
          title="Create a roster"
          description="A roster covers a period — e.g. a month of Sunday & Wednesday services."
          submitLabel="Create roster"
          action={createRoster}
          disabled={session.isDemo}
        >
          <Field label="Roster name" name="name" placeholder="e.g. July 2026" required />
          <Field label="Start date" name="startDate" type="date" required />
          <Field label="End date" name="endDate" type="date" required />
          <Field label="Notes (optional)" name="notes" type="textarea" placeholder="Anything the team should know…" />
        </ActionDialog>
      </PageHeader>

      <RostersClient
        rosters={rosters.map((r) => ({
          id: r.id,
          name: r.name,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          notes: r.notes,
          slots: r.slots.map((s) => ({
            id: s.id,
            service: s.service,
            role: s.role,
            date: s.date.toISOString(),
            personId: s.personId,
            personName: s.personName ?? (s.person ? `${s.person.firstName} ${s.person.lastName}` : null),
            hasPhone: !!s.person?.phone,
            notified: !!s.notifiedAt,
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
