import { requireModule, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { PayrollTabs, PrivateNotice } from "@/components/app/payroll/ui";
import { ReportsClient } from "@/components/app/payroll/reports-client";

export const metadata = { title: "Payroll reports" };

export default async function PayrollReportsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const pre = await requireSession();
  if (pre.impersonating) return <PrivateNotice />;
  const session = await requireModule("payroll");
  const sp = await searchParams;
  const runs = await db.payrollRun.findMany({
    where: { churchId: session.churchId, status: { not: "draft" } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    take: 48,
    select: { id: true, title: true, status: true, year: true },
  });
  return (
    <div>
      <PageHeader title="Payroll reports" description="Schedules for SSNIT and GRA, payment lists and totals. Excel or CSV." />
      <PayrollTabs canManage={session.payroll === "manage"} />
      <ReportsClient runs={runs} initialRun={runs.some((r) => r.id === sp.run) ? sp.run! : null} canManage={session.payroll === "manage"} />
    </div>
  );
}
