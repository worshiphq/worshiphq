import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { RostersClient } from "@/components/app/rosters-client";
import { createRoster, addSlot } from "@/app/actions/rosters";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Volunteer rosters" };

export default async function RostersPage() {
  const session = await requireModule("volunteers");

  const [rosters, members, groups] = await Promise.all([
    db.volunteerRoster.findMany({
      where: { churchId: session.churchId },
      orderBy: { startDate: "desc" },
      include: {
        slots: {
          orderBy: { date: "asc" },
          include: { person: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.group.findMany({
      where: { churchId: session.churchId, type: "ministry" },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ministryOptions = groups.map((g) => g.name);

  return (
    <div>
      <PageHeader
        title="Volunteer rosters"
        description="Schedule volunteers for services, events, and ministries."
      >
        <ActionDialog
          triggerLabel="New roster"
          triggerIcon={<Plus />}
          title="Create roster"
          description="Set up a new volunteer schedule."
          submitLabel="Create"
          action={createRoster}
          disabled={session.isDemo}
        >
          <Field label="Roster name" name="name" placeholder="e.g. Sunday Ushering - July" required />
          <Field label="Ministry" name="ministry" type="select" options={ministryOptions} />
          <Field label="Start date" name="startDate" type="date" required />
          <Field label="End date" name="endDate" type="date" required />
          <Field label="Notes" name="notes" type="textarea" placeholder="Instructions or notes..." />
        </ActionDialog>
      </PageHeader>

      <RostersClient
        rosters={rosters.map((r) => ({
          id: r.id,
          name: r.name,
          ministry: r.ministry,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          notes: r.notes,
          slots: r.slots.map((s) => ({
            id: s.id,
            role: s.role,
            date: s.date.toISOString(),
            shift: s.shift,
            status: s.status,
            memberName: s.person ? `${s.person.firstName} ${s.person.lastName}` : "Unassigned",
            personId: s.personId,
          })),
        }))}
        members={members.map((m) => ({ label: `${m.firstName} ${m.lastName}`, value: m.id }))}
        addSlotAction={addSlot}
        isDemo={session.isDemo}
      />
    </div>
  );
}
