import { redirect } from "next/navigation";
import { requireSession, planLockFor } from "@/lib/auth";
import { hasSection, canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { boardRequests, requestCounts } from "@/lib/data/maintenance";
import { ctxFrom } from "@/lib/expenses/post";
import { MaintenanceClient } from "@/components/app/maintenance-client";

export const metadata = { title: "Maintenance" };

/**
 * Open to every team member: anyone can report a problem and follow what they reported.
 * People who can see Maintenance see the whole board; managers assign, update and close jobs.
 */
export default async function MaintenancePage() {
  const session = await requireSession();
  if (planLockFor(session, "maintenance")) redirect("/app/settings?tab=billing");
  const seesAll = hasSection(session, "maintenance");
  const canWrite = canEdit(session, "maintenance");
  const ctx = ctxFrom(session);
  const mine = seesAll ? undefined : session.userId;
  const [rows, counts, facilities, team, accounts] = await Promise.all([
    boardRequests(session.churchId, mine),
    requestCounts(session.churchId, mine),
    db.facility.findMany({ where: { churchId: session.churchId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    canWrite ? db.user.findMany({ where: { churchId: session.churchId }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }) : Promise.resolve([]),
    canWrite && ctx.canPostExpenses ? db.churchAccount.findMany({ where: { churchId: session.churchId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }) : Promise.resolve([]),
  ]);
  return (
    <MaintenanceClient
      rows={rows}
      counts={counts}
      facilities={facilities}
      team={team.map((u) => ({ id: u.id, name: u.name, hasPhone: !!u.phone }))}
      accounts={accounts}
      seesAll={seesAll}
      canWrite={canWrite}
      canDelete={canWrite && session.canDelete}
      canPostExpenses={ctx.canPostExpenses}
      canSearchAssets={hasSection(session, "assets") && !planLockFor(session, "assets")}
    />
  );
}
