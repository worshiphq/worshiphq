import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireModule, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDetail } from "@/lib/data/payroll";
import { ensureSettings } from "@/lib/payroll/engine";
import { PendingLink } from "@/components/ui/pending-link";
import { PrivateNotice } from "@/components/app/payroll/ui";
import { RunClient } from "@/components/app/payroll/run-client";

export const metadata = { title: "Payroll run" };

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const pre = await requireSession();
  if (pre.impersonating) return <PrivateNotice />;
  const session = await requireModule("payroll");
  const { id } = await params;
  const run = await runDetail(session.churchId, id, { userId: session.userId, staffId: session.staffId });
  if (!run) notFound();
  const manage = session.payroll === "manage";
  const fundsOn = !session.planLocked?.includes("fund-accounting");
  const [accounts, funds, settings] = await Promise.all([
    db.churchAccount.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    fundsOn ? db.fund.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true, restricted: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    ensureSettings(db, session.churchId),
  ]);
  return (
    <div>
      <div className="mb-4"><PendingLink href="/app/payroll" variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} pendingLabel="Opening…">All payrolls</PendingLink></div>
      <RunClient run={run} canManage={manage} accounts={accounts} funds={funds} defaultAccountId={settings.defaultAccountId} />
    </div>
  );
}
