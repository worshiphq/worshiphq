import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { PledgesClient } from "@/components/app/pledges-client";
import { createCampaign, createPledge } from "@/app/actions/pledges";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus, Target } from "lucide-react";

export const metadata = { title: "Pledges & campaigns" };

export default async function PledgesPage() {
  const session = await requireModule("pledges");

  const [campaigns, pledges] = await Promise.all([
    db.campaign.findMany({
      where: { churchId: session.churchId },
      include: { _count: { select: { pledges: true } } },
      orderBy: { endsAt: "asc" },
    }),
    db.pledge.findMany({
      where: { churchId: session.churchId },
      include: { campaign: { select: { name: true } } },
      orderBy: [{ dueAt: "asc" }, { donorName: "asc" }],
      take: 500,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Pledges & campaigns" description="Track campaigns, pledges, and fulfilment progress.">
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

          <ActionDialog
            triggerLabel="New pledge"
            triggerIcon={<Plus />}
            title="Record pledge"
            description="Record a member's pledge commitment."
            submitLabel="Record"
            action={createPledge}
            disabled={session.isDemo}
          >
            <Field label="Donor name" name="donorName" placeholder="Full name" required />
            <Field label="Amount (GHS)" name="amount" type="number" placeholder="500" required />
            <Field
              label="Campaign"
              name="campaignId"
              options={campaigns.map((c) => ({ label: c.name, value: c.id }))}
            />
            <Field label="Due date" name="dueAt" type="date" />
          </ActionDialog>
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
          amount: Number(p.amount),
          fulfilled: Number(p.fulfilled),
          dueAt: p.dueAt?.toISOString() ?? null,
          campaignName: p.campaign?.name ?? null,
        }))}
      />
    </div>
  );
}
