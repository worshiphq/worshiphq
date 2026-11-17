import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { expiryState, serviceDue, type DueState } from "@/lib/fleet/due";
import { kmPerLitre, costPerKm } from "@/lib/fleet/efficiency";

export type Paper = { key: "insurance" | "roadworthy" | "registration"; label: string; date: string | null; days: number | null; state: DueState };
export type NextService = { title: string; state: DueState; reason: string } | null;

export type VehicleCard = {
  id: string;
  assetId: string;
  name: string;
  regNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  kind: string;
  seats: number | null;
  fuelType: string;
  photoUrl: string | null;
  odometerKm: number;
  active: boolean;
  status: string;
  papers: Paper[];
  nextService: NextService;
  openTrip: { id: string; driverName: string | null; purpose: string; startAt: string; odometerStart: number | null } | null;
  drivers: { id: string; name: string; isPrimary: boolean }[];
  insurer: string | null;
  insurancePolicyNo: string | null;
  insuranceType: string | null;
};

const STATE_RANK: Record<DueState, number> = { overdue: 0, soon: 1, ok: 2, unset: 3 };

export function papersOf(v: { insuranceExpires: Date | null; roadworthyExpires: Date | null; registrationExpires: Date | null }, now = new Date()): Paper[] {
  const one = (key: Paper["key"], label: string, d: Date | null): Paper => ({ key, label, date: d?.toISOString() ?? null, ...expiryState(d, now) });
  return [one("insurance", "Insurance", v.insuranceExpires), one("roadworthy", "Roadworthy", v.roadworthyExpires), one("registration", "DVLA renewal", v.registrationExpires)];
}

function soonestService(schedules: { title: string; everyDays: number | null; everyKm: number | null; lastDoneAt: Date | null; lastDoneKm: number | null; active: boolean }[], km: number, now: Date): NextService {
  let best: NextService = null;
  for (const s of schedules) {
    if (!s.active) continue;
    const d = serviceDue(s, km, now);
    if (d.state === "unset") continue;
    if (!best || STATE_RANK[d.state] < STATE_RANK[best.state]) best = { title: s.title, state: d.state, reason: d.reason };
  }
  return best;
}

export async function listVehicles(churchId: string, now = new Date()): Promise<VehicleCard[]> {
  const rows = await db.vehicle.findMany({
    where: { churchId },
    orderBy: [{ active: "desc" }, { regNumber: "asc" }],
    include: {
      asset: { select: { name: true, photoUrl: true, status: true, schedules: { select: { title: true, everyDays: true, everyKm: true, lastDoneAt: true, lastDoneKm: true, active: true } } } },
      trips: { where: { endAt: null }, take: 1, orderBy: { startAt: "desc" }, select: { id: true, driverName: true, purpose: true, startAt: true, odometerStart: true } },
      drivers: { select: { id: true, name: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
    },
  });
  return rows.map((v) => ({
    id: v.id, assetId: v.assetId, name: v.asset.name, regNumber: v.regNumber, make: v.make, model: v.model, year: v.year, kind: v.kind,
    seats: v.seats, fuelType: v.fuelType, photoUrl: v.asset.photoUrl, odometerKm: v.odometerKm, active: v.active, status: v.asset.status,
    papers: papersOf(v, now),
    nextService: soonestService(v.asset.schedules, v.odometerKm, now),
    openTrip: v.trips[0] ? { ...v.trips[0], startAt: v.trips[0].startAt.toISOString() } : null,
    drivers: v.drivers,
    insurer: v.insurer,
    insurancePolicyNo: v.insurancePolicyNo,
    insuranceType: v.insuranceType,
  }));
}

/** Paper, licence and service items that are due within 30 days (or overdue), most urgent first. */
export function dueSoon(cards: VehicleCard[], licences: { vehicleId: string; regNumber: string; name: string; licenceExpires: Date | null }[], now = new Date()) {
  const items: { vehicleId: string; text: string; state: DueState; days: number | null; kind: string }[] = [];
  for (const c of cards) {
    if (!c.active) continue;
    for (const p of c.papers) {
      if (p.state !== "soon" && p.state !== "overdue") continue;
      items.push({ vehicleId: c.id, kind: p.key, state: p.state, days: p.days, text: p.state === "overdue" ? `${p.label} ran out ${-p.days!} day${p.days === -1 ? "" : "s"} ago: ${c.regNumber}` : `${p.label} ends ${p.days === 0 ? "today" : `in ${p.days} day${p.days === 1 ? "" : "s"}`}: ${c.regNumber}` });
    }
    if (c.nextService && (c.nextService.state === "soon" || c.nextService.state === "overdue")) items.push({ vehicleId: c.id, kind: "service", state: c.nextService.state, days: null, text: `${c.nextService.title} ${c.nextService.reason}: ${c.regNumber}` });
  }
  for (const l of licences) {
    const e = expiryState(l.licenceExpires, now);
    if (e.state === "soon" || e.state === "overdue") items.push({ vehicleId: l.vehicleId, kind: "licence", state: e.state, days: e.days, text: e.state === "overdue" ? `${l.name}'s driving licence has run out: ${l.regNumber}` : `${l.name}'s driving licence ends in ${e.days} days: ${l.regNumber}` });
  }
  return items.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (a.days ?? 99) - (b.days ?? 99));
}

export async function driverLicences(churchId: string) {
  const rows = await db.vehicleDriver.findMany({ where: { churchId, licenceExpires: { not: null }, vehicle: { active: true } }, select: { vehicleId: true, name: true, licenceExpires: true, vehicle: { select: { regNumber: true } } } });
  return rows.map((r) => ({ vehicleId: r.vehicleId, regNumber: r.vehicle.regNumber, name: r.name, licenceExpires: r.licenceExpires }));
}

/** km driven, fuel spend, repair spend, km per litre and cost per km in a date range. */
export async function vehicleMonth(churchId: string, vehicleId: string, from: Date, to: Date) {
  const v = await db.vehicle.findFirst({ where: { id: vehicleId, churchId }, select: { assetId: true } });
  if (!v) return null;
  const [trips, fuel, repairs, allFuel] = await Promise.all([
    db.vehicleTrip.findMany({ where: { churchId, vehicleId, startAt: { gte: from, lte: to } }, select: { odometerStart: true, odometerEnd: true } }),
    db.vehicleFuel.aggregate({ where: { churchId, vehicleId, date: { gte: from, lte: to } }, _sum: { cost: true, litres: true } }),
    db.maintenanceRecord.aggregate({ where: { churchId, assetId: v.assetId, date: { gte: from, lte: to } }, _sum: { cost: true } }),
    db.vehicleFuel.findMany({ where: { churchId, vehicleId }, orderBy: { date: "desc" }, take: 30, select: { date: true, litres: true, cost: true, odometer: true, fullTank: true } }),
  ]);
  const km = trips.reduce((t, x) => t + (x.odometerStart != null && x.odometerEnd != null ? Math.max(0, x.odometerEnd - x.odometerStart) : 0), 0);
  const fuelCost = Number(fuel._sum.cost ?? 0), repairCost = Number(repairs._sum.cost ?? 0);
  return { km, fuelCost, fuelLitres: Number(fuel._sum.litres ?? 0), repairCost, kmPerLitre: kmPerLitre(allFuel), costPerKm: costPerKm(fuelCost + repairCost, km) };
}

export async function getVehicleDetail(churchId: string, id: string, now = new Date()) {
  const v = await db.vehicle.findFirst({
    where: { id, churchId },
    include: {
      asset: { include: { documents: { orderBy: { createdAt: "desc" } }, schedules: { orderBy: { createdAt: "asc" } }, maintenance: { orderBy: { date: "desc" }, take: 40 } } },
      drivers: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      fuel: { orderBy: { date: "desc" }, take: 60, include: { expense: { select: { id: true } } } },
    },
  });
  if (!v) return null;
  const fuelIds = v.fuel.map((f) => f.id);
  const pending = fuelIds.length ? await db.expenseRequest.findMany({ where: { churchId, source: "fuel", sourceId: { in: fuelIds }, status: { in: ["pending", "approved"] } }, select: { sourceId: true } }) : [];
  const waiting = new Set(pending.map((p) => p.sourceId));
  const openTrip = await db.vehicleTrip.findFirst({ where: { churchId, vehicleId: id, endAt: null }, select: { id: true, driverName: true, purpose: true, startAt: true, odometerStart: true } });
  return {
    vehicle: v,
    papers: papersOf(v, now),
    schedules: v.asset.schedules.map((s) => ({ ...s, due: serviceDue(s, v.odometerKm, now) })),
    fuel: v.fuel.map((f) => ({ ...f, posting: f.expenseId ? "posted" as const : waiting.has(f.id) ? "waiting" as const : "none" as const })),
    openTrip,
  };
}

export const TRIP_PAGE = 25;
export type TripFilters = { vehicleId?: string; purpose?: string; month?: string };

export async function queryTrips(churchId: string, search: string, f: TripFilters, pageWanted: number) {
  const and: Prisma.VehicleTripWhereInput[] = [];
  const q = search.trim().slice(0, 60);
  if (q) and.push({ OR: [{ destination: { contains: q, mode: "insensitive" } }, { driverName: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] });
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
    const [y, m] = f.month.split("-").map(Number);
    and.push({ startAt: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } });
  }
  const where: Prisma.VehicleTripWhereInput = { churchId, ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}), ...(f.purpose ? { purpose: f.purpose } : {}), AND: and };
  const [total, agg] = await Promise.all([db.vehicleTrip.count({ where }), db.vehicleTrip.findMany({ where, select: { odometerStart: true, odometerEnd: true } })]);
  const page = Math.min(Math.max(1, pageWanted || 1), Math.max(1, Math.ceil(total / TRIP_PAGE)));
  const rows = await db.vehicleTrip.findMany({ where, orderBy: [{ startAt: "desc" }, { id: "asc" }], skip: (page - 1) * TRIP_PAGE, take: TRIP_PAGE, include: { vehicle: { select: { regNumber: true } } } });
  const totalKm = agg.reduce((t, x) => t + (x.odometerStart != null && x.odometerEnd != null ? Math.max(0, x.odometerEnd - x.odometerStart) : 0), 0);
  return {
    rows: rows.map((t) => ({
      id: t.id, regNumber: t.vehicle.regNumber, vehicleId: t.vehicleId, purpose: t.purpose, destination: t.destination, driverName: t.driverName,
      startAt: t.startAt.toISOString(), endAt: t.endAt?.toISOString() ?? null, odometerStart: t.odometerStart, odometerEnd: t.odometerEnd,
      km: t.odometerStart != null && t.odometerEnd != null ? Math.max(0, t.odometerEnd - t.odometerStart) : null, passengers: t.passengers, note: t.note,
    })),
    total,
    page,
    extra: { totalKm },
  };
}
