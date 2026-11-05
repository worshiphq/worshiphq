import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getAccountOptions } from "@/lib/data/accounts";
import { PledgesClient } from "@/components/app/pledges-client";
import { PledgeRecorder } from "@/components/app/pledge-recorder";
import { createCampaign } from "@/app/actions/pledges";
import { PageHeader } from "@/components/app/page-header";
import { queryPledges, pledgeTotals } from "@/lib/data/pledges";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Target } from "lucide-react";

export const metadata = { title: "Pledges & campaigns" };

export default async function PledgesPage() {
  const session = await requireModule("pledges");

  const [campaigns, firstPledges, members, harvests, church, totals] = await Promise.all([
    db.campaign.findMany({
      where: { churchId: session.churchId },
      include: { _count: { select: { pledges: true } } },
      orderBy: { endsAt: "asc" },
    }),
    queryPledges(session.churchId, "", 1),
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
    pledgeTotals(session.churchId),
  ]);

  const accounts = await getAccountOptions(session.churchId);

  return (
    <div>
      <PageHeader title="Pledges & campaigns" description="Track campaigns, pledges, payments and fulfilment - with automatic reminders.">
        <div className="flex gap-2">
          <ActionDialog
            triggerLabel="New campaign"
            triggerIcon={<Target />}
            title="Create campaign"
            description="Set a fundraising goal for your church."
            submitLabel="Create"
            action={createCampaign}
            disabled={!canEdit(session, "pledges")}
          >
            <Field label="Campaign name" name="name" placeholder="e.g. Building fund" required />
            <Field label="Goal (GHS)" name="goal" type="number" placeholder="10000" required />
            <Field label="End date" name="endsAt" type="date" />
          </ActionDialog>

          <PledgeRecorder
            disabled={!canEdit(session, "pledges")}
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
        initial={firstPledges}
        totals={totals}
        reminderDays={church?.pledgeReminderDays ?? [30, 7, 3]}
        receiptTemplate={church?.pledgeReceiptTemplate ?? null}
        reminderTemplate={church?.pledgeReminderTemplate ?? null}
        accounts={accounts}
        isDemo={session.isDemo}
      />
    </div>
  );
}
