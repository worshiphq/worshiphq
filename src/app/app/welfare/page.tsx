import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccountOptions } from "@/lib/data/accounts";
import { WelfareClient } from "@/components/app/welfare-client";
import { createWelfareRecord } from "@/app/actions/welfare";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus, HandCoins } from "lucide-react";

export const metadata = { title: "Welfare & benevolence" };

const WELFARE_TYPES = ["financial", "food", "medical", "housing", "education", "other"];

export default async function WelfarePage() {
  const session = await requireModule("welfare");

  const [records, people, accounts] = await Promise.all([
    db.welfareRecord.findMany({
      where: { churchId: session.churchId },
      include: { person: { select: { firstName: true, lastName: true } } },
      orderBy: { date: "desc" },
      take: 200,
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 500,
    }),
    getAccountOptions(session.churchId),
  ]);

  const collected = records.filter((r) => r.kind === "dues").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const disbursed = records.filter((r) => r.kind !== "dues").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const accountField = accounts.length > 1;
  const memberOptions = people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p.id }));

  return (
    <div>
      <PageHeader
        title="Welfare & benevolence"
        description="Collect members’ welfare dues and track the aid your church gives out."
      >
        <ActionDialog
          triggerLabel="Record dues"
          triggerIcon={<HandCoins />}
          variant="secondary"
          title="Record welfare dues"
          description="Welfare contribution collected from a member. Adds to the welfare balance."
          submitLabel="Record dues"
          action={createWelfareRecord}
          disabled={session.isDemo}
        >
          <input type="hidden" name="kind" value="dues" />
          <Field label="Member" name="personId" options={[{ label: "— Select member —", value: "" }, ...memberOptions]} required />
          <Field label="Amount (GHS)" name="amount" type="number" placeholder="0" required />
          {accountField && (
            <Field label="Deposit into account" name="accountId"
              options={accounts.map((a) => ({ label: `${a.name}${a.isDefault ? " (default)" : ""}`, value: a.id }))} />
          )}
          <Field label="Note (optional)" name="description" placeholder="e.g. July welfare dues" />
          <Field label="Date" name="date" type="date" />
        </ActionDialog>

        <ActionDialog
          triggerLabel="Record aid"
          triggerIcon={<Plus />}
          title="Record welfare aid"
          description="Support given out — financial, food, medical, etc. Deducts from the account."
          submitLabel="Record aid"
          action={createWelfareRecord}
          disabled={session.isDemo}
        >
          <input type="hidden" name="kind" value="aid" />
          <Field label="Recipient name" name="recipientName" placeholder="Full name" required />
          <Field label="Type" name="type" options={WELFARE_TYPES} />
          <Field label="Amount (GHS)" name="amount" type="number" placeholder="0" />
          {accountField && (
            <Field label="Pay from account" name="accountId"
              options={accounts.map((a) => ({ label: `${a.name}${a.isDefault ? " (default)" : ""}`, value: a.id }))} />
          )}
          <Field label="Description" name="description" placeholder="Details of aid given..." />
          <Field label="Date" name="date" type="date" />
          <Field label="Link to member (optional)" name="personId"
            options={[{ label: "— None —", value: "" }, ...memberOptions]} />
        </ActionDialog>
      </PageHeader>

      <WelfareClient
        records={records.map((r) => ({
          id: r.id,
          kind: r.kind === "dues" ? "dues" : "aid",
          recipientName: r.recipientName,
          type: r.type,
          amount: r.amount ? Number(r.amount) : null,
          description: r.description,
          date: r.date.toISOString(),
          personName: r.person ? `${r.person.firstName} ${r.person.lastName}` : null,
        }))}
        collected={collected}
        disbursed={disbursed}
      />
    </div>
  );
}
