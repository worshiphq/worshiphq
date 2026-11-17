import { requireModule, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRuns, pendingRemittances, payrollChecklist } from "@/lib/data/payroll";
import { ensureSettings } from "@/lib/payroll/engine";
import { PageHeader } from "@/components/app/page-header";
import { PayrollTabs, PrivateNotice } from "@/components/app/payroll/ui";
import { RunsClient } from "@/components/app/payroll/runs-client";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const pre = await requireSession();
  if (pre.impersonating) return <PrivateNotice />;
  const session = await requireModule("payroll");
  const [runs, pending, checklist, accounts, settings] = await Promise.all([
    listRuns(session.churchId),
    pendingRemittances(session.churchId),
    payrollChecklist(session.churchId),
    db.churchAccount.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ensureSettings(db, session.churchId),
  ]);
  const accra = new Date(Date.now()); // Ghana is UTC all year.
  return (
    <div>
      <PageHeader title="Payroll" description="Monthly pay, SSNIT and PAYE. Private: only people the Main Admin chooses can see it." />
      <PayrollTabs canManage={session.payroll === "manage"} />
      <RunsClient
        runs={runs}
        pending={pending}
        checklist={checklist}
        canManage={session.payroll === "manage"}
        accounts={accounts}
        defaultAccountId={settings.defaultAccountId}
        now={{ year: accra.getUTCFullYear(), month: accra.getUTCMonth() + 1 }}
      />
    </div>
  );
}
