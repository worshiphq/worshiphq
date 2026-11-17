import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listVehicles, driverLicences, dueSoon } from "@/lib/data/fleet";
import { ctxFrom } from "@/lib/expenses/post";
import { FleetClient } from "@/components/app/vehicles/fleet-client";

export const metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  const session = await requireModule("vehicles");
  const canWrite = canEdit(session, "vehicles");
  const ctx = ctxFrom(session);
  const [cards, licences, accounts] = await Promise.all([
    listVehicles(session.churchId),
    driverLicences(session.churchId),
    canWrite && ctx.canPostExpenses ? db.churchAccount.findMany({ where: { churchId: session.churchId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }) : Promise.resolve([]),
  ]);
  return <FleetClient cards={cards} due={dueSoon(cards, licences)} accounts={accounts} canWrite={canWrite} canPostExpenses={ctx.canPostExpenses} />;
}
