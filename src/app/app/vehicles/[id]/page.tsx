import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit, canManage } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getVehicleDetail, vehicleMonth, queryTrips } from "@/lib/data/fleet";
import { ctxFrom } from "@/lib/expenses/post";
import { VehicleDetail } from "@/components/app/vehicles/vehicle-detail";

export const metadata = { title: "Vehicle" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireModule("vehicles");
  const { id } = await params;
  const d = await getVehicleDetail(session.churchId, id);
  if (!d) notFound();
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const canWrite = canEdit(session, "vehicles");
  const ctx = ctxFrom(session);
  const [month, trips, accounts] = await Promise.all([
    vehicleMonth(session.churchId, id, from, to),
    queryTrips(session.churchId, "", { vehicleId: id }, 1),
    canWrite && ctx.canPostExpenses ? db.churchAccount.findMany({ where: { churchId: session.churchId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }) : Promise.resolve([]),
  ]);
  const v = d.vehicle;
  const iso = (x: Date | null) => x?.toISOString() ?? null;
  return (
    <VehicleDetail
      vehicle={{
        id: v.id, assetId: v.assetId, name: v.asset.name, regNumber: v.regNumber, make: v.make, model: v.model, year: v.year, colour: v.colour, kind: v.kind,
        seats: v.seats, fuelType: v.fuelType, chassisNo: v.chassisNo, odometerKm: v.odometerKm, odometerAt: iso(v.odometerAt), insurer: v.insurer,
        insurancePolicyNo: v.insurancePolicyNo, insuranceType: v.insuranceType, insuranceExpires: iso(v.insuranceExpires), roadworthyExpires: iso(v.roadworthyExpires),
        registrationExpires: iso(v.registrationExpires), notes: v.notes, active: v.active, photoUrl: v.asset.photoUrl, purchaseDate: iso(v.asset.purchaseDate),
        purchasePrice: v.asset.purchasePrice, tagCode: v.asset.tagCode,
      }}
      papers={d.papers}
      month={month ? { ...month, label: now.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }) } : null}
      drivers={v.drivers.map((x) => ({ id: x.id, name: x.name, phone: x.phone, licenceNo: x.licenceNo, licenceClass: x.licenceClass, licenceExpires: iso(x.licenceExpires), isPrimary: x.isPrimary, personId: x.personId }))}
      openTrip={d.openTrip ? { ...d.openTrip, startAt: d.openTrip.startAt.toISOString() } : null}
      trips={trips}
      fuel={d.fuel.map((f) => ({ id: f.id, date: f.date.toISOString(), litres: f.litres, cost: f.cost, odometer: f.odometer, station: f.station, fullTank: f.fullTank, receiptUrl: f.receiptUrl, posting: f.posting, expenseId: f.expenseId }))}
      schedules={d.schedules.map((s) => ({ id: s.id, title: s.title, everyDays: s.everyDays, everyKm: s.everyKm, lastDoneAt: iso(s.lastDoneAt), state: s.due.state, reason: s.due.reason }))}
      records={v.asset.maintenance.map((m) => ({ id: m.id, kind: m.kind, title: m.title, date: m.date.toISOString(), cost: m.cost, vendorName: m.vendorName, odometerKm: m.odometerKm, expenseId: m.expenseId }))}
      documents={v.asset.documents.map((x) => ({ id: x.id, kind: x.kind, name: x.name, url: x.url, contentType: x.contentType, expiresAt: iso(x.expiresAt), createdAt: x.createdAt.toISOString() }))}
      accounts={accounts}
      canWrite={canWrite}
      canDelete={canWrite && session.canDelete}
      canDeleteExpense={session.canDelete && canManage(session, "expenses")}
      canPostExpenses={ctx.canPostExpenses}
    />
  );
}
