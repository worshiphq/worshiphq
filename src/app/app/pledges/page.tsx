import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { PledgesClient } from "@/components/app/pledges-client";
import { PledgeRecorder } from "@/components/app/pledge-recorder";
import { createCampaign } from "@/app/actions/pledges";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Target } from "lucide-react";

export const metadata = { title: "Pledges & campaigns" };

export default async function PledgesPage() {
  const session = await requireModule("pledges");

  const [campaigns, pledges, members, harvests, church] = await Promise.all([
    db.campaign.findMany({
      where: { churchId: session.churchId },
      include: { _count: { select: { pledges: true } } },
      orderBy: { endsAt: "asc" },
    }),
    db.pledge.findMany({
      where: { churchId: session.churchId },
      include: {
        campaign: { select: { name: true } },
        harvest: { select: { year: true, title: true } },
        payments: { orderBy: { date: "desc" } },
      },
      orderBy: [{ dueAt: "asc" }, { donorName: "asc" }],
      take: 500,
    }),
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "inactive" } },
      select: { id: true, firstName: true, lastName: true, phone: true, memberId: true },
      orderBy: { firstName: "asc" },
      take: 2000,
    }),
    db.harvest.findMany({
      where: { churchId: session.churchId },
      select: { id: true, year: true, title: true },
      orderBy: { year: "desc" },
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { pledgeReminderDays: true, pledgeReceiptTemplate: true, pledgeReminderTemplate: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Pledges & campaigns" description="Track campaigns, pledges, payments and fulfilment — with automatic reminders.">
        <div className="flex gap-2">
          <ActionDialog
            triggerLabel="New campaign"
            triggerIcon={<Target />}
            title="Create campaign"
            description="Set a fundraising goal for your church."
            submitLabel="Create"
            action={createCampaign}
            disabled={session.isDemo}
          >
            <Field label="Campaign name" name="name" placeholder="e.g. Building fund" required />
            <Field label="Goal (GHS)" name="goal" type="number" placeholder="10000" required />
            <Field label="End date" name="endsAt" type="date" />
          </ActionDialog>

          <PledgeRecorder
            disabled={session.isDemo}
            members={members.map((m) => ({
              id: m.id,
              name: `${m.firstName} ${m.lastName}`.trim(),
              phone: m.phone,
              memberId: m.memberId,
            }))}
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            harvests={harvests.map((h) => ({ id: h.id, label: `${h.title} ${h.year}` }))}
          />
        </div>
      </PageHeader>

      <PledgesClient
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          goal: Number(c.goal),
          raised: Number(c.raised),
          endsAt: c.endsAt?.toISOString() ?? null,
          pledgeCount: c._count.pledges,
        }))}
        pledges={pledges.map((p) => ({
          id: p.id,
          donorName: p.donorName,
          donorPhone: p.donorPhone,
          donorType: p.donorType,
          amount: Number(p.amount),
          fulfilled: Number(p.fulfilled),
          dueAt: p.dueAt?.toISOString() ?? null,
          campaignName: p.campaign?.name ?? null,
          harvestLabel: p.harvest ? `${p.harvest.title} ${p.harvest.year}` : null,
          notes: p.notes,
          payments: p.payments.map((pay) => ({
            id: pay.id,
            amount: Number(pay.amount),
            method: String(pay.method).replace(/_/g, " "),
            note: pay.note,
            date: pay.date.toISOString(),
          })),
        }))}
        reminderDays={church?.pledgeReminderDays ?? [30, 7, 3]}
        receiptTemplate={church?.pledgeReceiptTemplate ?? null}
        reminderTemplate={church?.pledgeReminderTemplate ?? null}
        isDemo={session.isDemo}
      />
    </div>
  );
}
