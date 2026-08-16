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

/** Parse a "yyyy-mm" search param into {y, m}, or null. */
function parseYm(v?: string): { y: number; m: number } | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (y < 1980 || y > 2050 || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

export default async function WelfarePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; from?: string; to?: string }>;
}) {
  const session = await requireModule("welfare");
  const { year: yearParam, from: fromParam, to: toParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  // Range mode: both from & to given and valid, with from ≤ to.
  const from = parseYm(fromParam);
  const to = parseYm(toParam);
  let range: { fromY: number; fromM: number; toY: number; toM: number } | undefined;
  if (from && to) {
    const ordered = from.y < to.y || (from.y === to.y && from.m <= to.m) ? { a: from, b: to } : { a: to, b: from };
    range = { fromY: ordered.a.y, fromM: ordered.a.m, toY: ordered.b.y, toM: ordered.b.m };
  }

  const [welfare, people, accounts, smsBalance, church] = await Promise.all([
    getWelfareData(session.churchId, year, range),
    db.person.findMany({
      where: { churchId: session.churchId, status: { not: "inactive" } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    getAccountOptions(session.churchId),
    getSmsBalance(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { welfareDuesReceiptTemplate: true, welfareDuesReminderTemplate: true } }),
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
        templates={{
          receipt: church?.welfareDuesReceiptTemplate ?? null,
          reminder: church?.welfareDuesReminderTemplate ?? null,
        }}
        canWrite={!session.isDemo}
      />
    </div>
  );
}
