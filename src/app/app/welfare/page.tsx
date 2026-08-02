import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccountOptions } from "@/lib/data/accounts";
import { getWelfareData } from "@/lib/data/welfare";
import { getSmsBalance } from "@/lib/sms/credits";
import { WelfareClient } from "@/components/app/welfare-client";
import { createWelfareRecord } from "@/app/actions/welfare";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Welfare & benevolence" };

const WELFARE_TYPES = ["financial", "food", "medical", "housing", "education", "other"];

export default async function WelfarePage() {
  const session = await requireModule("welfare");

  const [welfare, people, accounts, smsBalance] = await Promise.all([
    getWelfareData(session.churchId),
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "inactive" } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    getAccountOptions(session.churchId),
    getSmsBalance(session.churchId),
  ]);

  const accountField = accounts.length > 1;
  const memberOptions = people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p.id }));

  return (
    <div>
      <PageHeader
        title="Welfare & benevolence"
        description="Track members’ monthly welfare dues — who has paid, who owes — and the aid your church gives out."
      >
        <ActionDialog
          triggerLabel="Record aid"
          triggerIcon={<Plus />}
          variant="secondary"
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
        data={welfare}
        members={people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), hasPhone: !!p.phone }))}
        accounts={accounts}
        smsBalance={smsBalance}
        canWrite={!session.isDemo}
      />
    </div>
  );
}
