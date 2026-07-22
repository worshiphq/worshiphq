import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { WelfareClient } from "@/components/app/welfare-client";
import { createWelfareRecord } from "@/app/actions/welfare";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Welfare & benevolence" };

const WELFARE_TYPES = ["financial", "food", "medical", "housing", "education", "other"];

export default async function WelfarePage() {
  const session = await requireModule("welfare");

  const [records, people] = await Promise.all([
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
  ]);

  const totalAmount = records.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Welfare & benevolence"
        description="Track aid and support given to members and community."
      >
        <ActionDialog
          triggerLabel="Record aid"
          triggerIcon={<Plus />}
          title="Record welfare aid"
          description="Log financial, food, medical, or other support given."
          submitLabel="Record"
          action={createWelfareRecord}
          disabled={session.isDemo}
        >
          <Field label="Recipient name" name="recipientName" placeholder="Full name" required />
          <Field label="Type" name="type" options={WELFARE_TYPES} />
          <Field label="Amount (GHS)" name="amount" type="number" placeholder="0" />
          <Field label="Description" name="description" placeholder="Details of aid given..." />
          <Field label="Date" name="date" type="date" />
          <Field
            label="Link to member (optional)"
            name="personId"
            options={[
              { label: "— None —", value: "" },
              ...people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p.id })),
            ]}
          />
        </ActionDialog>
      </PageHeader>

      <WelfareClient
        records={records.map((r) => ({
          id: r.id,
          recipientName: r.recipientName,
          type: r.type,
          amount: r.amount ? Number(r.amount) : null,
          description: r.description,
          date: r.date.toISOString(),
          personName: r.person ? `${r.person.firstName} ${r.person.lastName}` : null,
        }))}
        totalAmount={totalAmount}
        totalCount={records.length}
      />
    </div>
  );
}
