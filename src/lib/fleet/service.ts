import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { nextTag } from "@/lib/assets/service";
import { postExpense, round2, safeRevalidate, LinkError, type Ctx, type Tx } from "@/lib/expenses/post";
import { createRequest } from "@/lib/expenses/requests";

export type Result = { ok: true; id: string } | { ok: false; error: string };

export const VEHICLE_KINDS = [
  { key: "bus", label: "Bus" },
  { key: "minibus", label: "Minibus" },
  { key: "car", label: "Car" },
  { key: "pickup", label: "Pickup" },
  { key: "van", label: "Van" },
  { key: "motorbike", label: "Motorbike" },
  { key: "other", label: "Other" },
] as const;
export const FUEL_TYPES = [
  { key: "diesel", label: "Diesel" },
  { key: "petrol", label: "Petrol" },
  { key: "lpg", label: "Gas (LPG)" },
  { key: "electric", label: "Electric" },
  { key: "hybrid", label: "Hybrid" },
] as const;
export const TRIP_PURPOSES = [
  { key: "service-pickup", label: "Service pick-up" },
  { key: "event", label: "Event" },
  { key: "errand", label: "Errand" },
  { key: "outreach", label: "Outreach" },
  { key: "funeral", label: "Funeral" },
  { key: "other", label: "Other" },
] as const;
const KIND_KEYS: string[] = VEHICLE_KINDS.map((k) => k.key);
const FUEL_KEYS: string[] = FUEL_TYPES.map((k) => k.key);
const PURPOSE_KEYS: string[] = TRIP_PURPOSES.map((k) => k.key);

/** "gr1234 - 20" -> "GR 1234-20"-ish: upper case, single spaces, no spaces around the dash. */
export function normaliseReg(raw: string): string {
  return raw.toUpperCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim().slice(0, 20);
}

const validDate = (d: Date | null | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);
const intOrNull = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);

/** Move a vehicle's odometer forward only. A lower reading is ignored here (callers refuse it first). */
export async function bumpOdometer(tx: Tx | typeof db, vehicleId: string, km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return;
  await tx.vehicle.updateMany({ where: { id: vehicleId, odometerKm: { lt: Math.round(km) } }, data: { odometerKm: Math.round(km), odometerAt: new Date() } });
}

const lowerReading = (last: number) => `The odometer reading is lower than the last one (${last.toLocaleString("en-GB")} km). Check the number.`;

export type VehicleInput = {
  id?: string | null;
  name?: string | null;
  regNumber: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  colour?: string | null;
  kind?: string | null;
  seats?: number | null;
  fuelType?: string | null;
  chassisNo?: string | null;
  odometerKm?: number | null;
  insurer?: string | null;
  insurancePolicyNo?: string | null;
  insuranceType?: string | null;
  insuranceExpires?: Date | null;
  roadworthyExpires?: Date | null;
  registrationExpires?: Date | null;
  notes?: string | null;
  active?: boolean | null;
  photoUrl?: string | null;
  purchaseDate?: Date | null;
  purchasePrice?: number | null;
};

/** Create or edit a vehicle. A new vehicle gets its Asset row (category vehicle, with a tag) in the same transaction. */
export async function saveVehicle(ctx: Ctx, input: VehicleInput): Promise<Result> {
  const regNumber = normaliseReg(String(input.regNumber ?? ""));
  if (regNumber.length < 3) return { ok: false, error: "Enter the number plate." };
  const make = input.make?.trim() || null, model = input.model?.trim() || null;
  const name = input.name?.trim() || [make, model].filter(Boolean).join(" ") || `Vehicle ${regNumber}`;
  const year = input.year && input.year > 1950 && input.year < 2100 ? Math.round(input.year) : null;
  const vehicleData = {
    regNumber,
    make,
    model,
    year,
    colour: input.colour?.trim() || null,
    kind: input.kind && KIND_KEYS.includes(input.kind) ? input.kind : "bus",
    seats: intOrNull(input.seats),
    fuelType: input.fuelType && FUEL_KEYS.includes(input.fuelType) ? input.fuelType : "diesel",
    chassisNo: input.chassisNo?.trim() || null,
    insurer: input.insurer?.trim() || null,
    insurancePolicyNo: input.insurancePolicyNo?.trim() || null,
    insuranceType: input.insuranceType === "comprehensive" || input.insuranceType === "third-party" ? input.insuranceType : null,
    insuranceExpires: validDate(input.insuranceExpires),
    roadworthyExpires: validDate(input.roadworthyExpires),
    registrationExpires: validDate(input.registrationExpires),
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };
  const assetData = {
    name,
    category: "vehicle",
    serialNo: vehicleData.chassisNo,
    purchaseDate: validDate(input.purchaseDate),
    purchasePrice: input.purchasePrice && input.purchasePrice > 0 ? round2(input.purchasePrice) : null,
    ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
  };
  const km = intOrNull(input.odometerKm);

  try {
    if (input.id) {
      const v = await db.vehicle.findFirst({ where: { id: input.id, churchId: ctx.churchId }, select: { id: true, assetId: true, odometerKm: true } });
      if (!v) return { ok: false, error: "That vehicle was not found." };
      if (km != null && km < v.odometerKm) return { ok: false, error: lowerReading(v.odometerKm) };
      await db.$transaction(async (tx) => {
        await tx.vehicle.update({ where: { id: v.id }, data: vehicleData });
        await tx.asset.update({ where: { id: v.assetId }, data: assetData });
        await bumpOdometer(tx, v.id, km);
      });
      await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "vehicle", entityId: v.id, detail: `Updated vehicle ${regNumber}` });
      safeRevalidate("/app/vehicles", `/app/vehicles/${v.id}`, "/app/assets");
      return { ok: true, id: v.id };
    }
    const created = await db.$transaction(async (tx) => {
      const tagCode = await nextTag(ctx.churchId, tx);
      const asset = await tx.asset.create({ data: { churchId: ctx.churchId, ...assetData, tagCode, inServiceDate: assetData.purchaseDate }, select: { id: true } });
      return tx.vehicle.create({ data: { churchId: ctx.churchId, assetId: asset.id, ...vehicleData, odometerKm: km ?? 0, odometerAt: km != null ? new Date() : null }, select: { id: true } });
    });
    await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "vehicle", entityId: created.id, detail: `Added vehicle ${regNumber}` });
    safeRevalidate("/app/vehicles", "/app/assets");
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: `${regNumber} is already on your vehicle list.` };
    throw e;
  }
}

export type DriverInput = { id?: string | null; vehicleId: string; personId?: string | null; name?: string | null; phone?: string | null; licenceNo?: string | null; licenceClass?: string | null; licenceExpires?: Date | null; isPrimary?: boolean };

export async function saveDriver(ctx: Ctx, input: DriverInput): Promise<Result> {
  const vehicle = await db.vehicle.findFirst({ where: { id: input.vehicleId, churchId: ctx.churchId }, select: { id: true, regNumber: true } });
  if (!vehicle) return { ok: false, error: "That vehicle was not found." };
  let name = input.name?.trim() || "";
  let phone = input.phone?.trim() || null;
  let personId: string | null = null;
  if (input.personId) {
    const p = await db.person.findFirst({ where: { id: input.personId, churchId: ctx.churchId }, select: { id: true, firstName: true, lastName: true, phone: true } });
    if (!p) return { ok: false, error: "That person was not found." };
    personId = p.id;
    name = name || `${p.firstName} ${p.lastName}`.trim();
    phone = phone ?? p.phone;
  }
  if (!name) return { ok: false, error: "Choose a person or type the driver's name." };
  const data = { personId, name, phone, licenceNo: input.licenceNo?.trim() || null, licenceClass: input.licenceClass?.trim() || null, licenceExpires: validDate(input.licenceExpires), isPrimary: !!input.isPrimary };
  const id = await db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.vehicleDriver.updateMany({ where: { vehicleId: vehicle.id, churchId: ctx.churchId }, data: { isPrimary: false } });
    if (input.id) {
      const own = await tx.vehicleDriver.findFirst({ where: { id: input.id, vehicleId: vehicle.id, churchId: ctx.churchId }, select: { id: true } });
      if (!own) return null;
      await tx.vehicleDriver.update({ where: { id: own.id }, data });
      return own.id;
    }
    return (await tx.vehicleDriver.create({ data: { churchId: ctx.churchId, vehicleId: vehicle.id, ...data }, select: { id: true } })).id;
  });
  if (!id) return { ok: false, error: "That driver was not found." };
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: input.id ? "update" : "create", entity: "vehicleDriver", entityId: id, detail: `${input.id ? "Updated" : "Added"} driver ${name} for ${vehicle.regNumber}` });
  safeRevalidate(`/app/vehicles/${vehicle.id}`, "/app/vehicles");
  return { ok: true, id };
}

async function driverFor(ctx: Ctx, vehicleId: string, driverId?: string | null, driverName?: string | null) {
  if (driverId) {
    const d = await db.vehicleDriver.findFirst({ where: { id: driverId, churchId: ctx.churchId, vehicleId }, select: { id: true, name: true } });
    if (!d) return { error: "That driver was not found." } as const;
    return { id: d.id, name: d.name } as const;
  }
  return { id: null, name: driverName?.trim() || null } as const;
}

export type TripInput = {
  vehicleId: string;
  driverId?: string | null;
  driverName?: string | null;
  purpose?: string | null;
  destination?: string | null;
  odometerStart?: number | null;
  odometerEnd?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
  passengers?: number | null;
  eventId?: string | null;
  note?: string | null;
};

async function tripBase(ctx: Ctx, input: TripInput) {
  const v = await db.vehicle.findFirst({ where: { id: input.vehicleId, churchId: ctx.churchId }, select: { id: true, regNumber: true, odometerKm: true } });
  if (!v) return { error: "That vehicle was not found." } as const;
  const driver = await driverFor(ctx, v.id, input.driverId, input.driverName);
  if ("error" in driver) return { error: driver.error } as const;
  let eventId: string | null = null;
  if (input.eventId) {
    const ev = await db.event.findFirst({ where: { id: input.eventId, churchId: ctx.churchId }, select: { id: true } });
    if (!ev) return { error: "That event was not found." } as const;
    eventId = ev.id;
  }
  return {
    v,
    data: {
      churchId: ctx.churchId,
      vehicleId: v.id,
      driverId: driver.id,
      driverName: driver.name,
      purpose: input.purpose && PURPOSE_KEYS.includes(input.purpose) ? input.purpose : "other",
      destination: input.destination?.trim() || null,
      eventId,
      note: input.note?.trim() || null,
      createdById: ctx.userId,
    },
  } as const;
}

export async function startTrip(ctx: Ctx, input: TripInput): Promise<Result> {
  const base = await tripBase(ctx, input);
  if ("error" in base) return { ok: false, error: base.error! };
  const start = intOrNull(input.odometerStart);
  if (start != null && start < base.v.odometerKm) return { ok: false, error: lowerReading(base.v.odometerKm) };
  try {
    const id = await db.$transaction(async (tx) => {
      const open = await tx.vehicleTrip.findFirst({ where: { vehicleId: base.v.id, churchId: ctx.churchId, endAt: null }, select: { driverName: true } });
      if (open) throw new LinkError(`${base.v.regNumber} is already on a trip${open.driverName ? ` with ${open.driverName}` : ""}. End that trip first.`);
      const row = await tx.vehicleTrip.create({ data: { ...base.data, startAt: validDate(input.startAt) ?? new Date(), odometerStart: start }, select: { id: true } });
      await bumpOdometer(tx, base.v.id, start);
      return row.id;
    });
    await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "vehicleTrip", entityId: id, detail: `Trip started: ${base.v.regNumber}` });
    safeRevalidate("/app/vehicles", `/app/vehicles/${base.v.id}`);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof LinkError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function endTrip(ctx: Ctx, tripId: string, input: { odometerEnd?: number | null; passengers?: number | null; note?: string | null; endAt?: Date | null }): Promise<Result> {
  const trip = await db.vehicleTrip.findFirst({ where: { id: tripId, churchId: ctx.churchId }, select: { id: true, vehicleId: true, endAt: true, odometerStart: true, note: true, vehicle: { select: { regNumber: true } } } });
  if (!trip) return { ok: false, error: "That trip was not found." };
  if (trip.endAt) return { ok: false, error: "This trip has already ended." };
  const end = intOrNull(input.odometerEnd);
  if (end != null && trip.odometerStart != null && end < trip.odometerStart) return { ok: false, error: `The reading at the end must be at least the start (${trip.odometerStart.toLocaleString("en-GB")} km).` };
  await db.$transaction(async (tx) => {
    await tx.vehicleTrip.updateMany({
      where: { id: trip.id, churchId: ctx.churchId, endAt: null },
      data: { endAt: validDate(input.endAt) ?? new Date(), odometerEnd: end, passengers: intOrNull(input.passengers), ...(input.note?.trim() ? { note: [trip.note, input.note.trim()].filter(Boolean).join(" / ") } : {}) },
    });
    await bumpOdometer(tx, trip.vehicleId, end);
  });
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "vehicleTrip", entityId: trip.id, detail: `Trip ended: ${trip.vehicle.regNumber}` });
  safeRevalidate("/app/vehicles", `/app/vehicles/${trip.vehicleId}`);
  return { ok: true, id: trip.id };
}

/** A whole trip recorded after the fact. */
export async function logTrip(ctx: Ctx, input: TripInput): Promise<Result> {
  const base = await tripBase(ctx, input);
  if ("error" in base) return { ok: false, error: base.error! };
  const start = intOrNull(input.odometerStart), end = intOrNull(input.odometerEnd);
  if (start != null && end != null && end < start) return { ok: false, error: "The reading at the end must be at least the start." };
  const startAt = validDate(input.startAt) ?? new Date();
  const endAt = validDate(input.endAt) ?? startAt;
  if (endAt < startAt) return { ok: false, error: "The trip cannot end before it starts." };
  const id = await db.$transaction(async (tx) => {
    const row = await tx.vehicleTrip.create({ data: { ...base.data, startAt, endAt, odometerStart: start, odometerEnd: end, passengers: intOrNull(input.passengers) }, select: { id: true } });
    await bumpOdometer(tx, base.v.id, end ?? start);
    return row.id;
  });
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "vehicleTrip", entityId: id, detail: `Trip logged: ${base.v.regNumber}` });
  safeRevalidate("/app/vehicles", `/app/vehicles/${base.v.id}`);
  return { ok: true, id };
}

export type FuelInput = {
  vehicleId: string;
  date?: Date | null;
  litres: number;
  cost: number;
  odometer?: number | null;
  station?: string | null;
  fullTank?: boolean;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  accountId?: string | null;
  fundId?: string | null;
  /** Record the cost as a church expense (or, without that right, send it to finance). */
  record?: boolean;
};

export type FuelResult = { ok: true; id: string; posted: "expense" | "request" | "none" } | { ok: false; error: string };

export async function logFuel(ctx: Ctx, input: FuelInput): Promise<FuelResult> {
  const v = await db.vehicle.findFirst({ where: { id: input.vehicleId, churchId: ctx.churchId }, select: { id: true, regNumber: true, odometerKm: true, assetId: true } });
  if (!v) return { ok: false, error: "That vehicle was not found." };
  const litres = Math.round(Number(input.litres) * 100) / 100;
  const cost = round2(Number(input.cost));
  if (!(litres > 0)) return { ok: false, error: "Enter how many litres." };
  if (!(cost > 0)) return { ok: false, error: "Enter what it cost." };
  const odometer = intOrNull(input.odometer);
  if (odometer != null && odometer < v.odometerKm) return { ok: false, error: lowerReading(v.odometerKm) };
  const date = validDate(input.date) ?? new Date();
  const fuelData = {
    churchId: ctx.churchId, vehicleId: v.id, date, litres, cost, odometer,
    station: input.station?.trim() || null, fullTank: input.fullTank ?? true,
    paymentMethod: input.paymentMethod || null, receiptUrl: input.receiptUrl || null, createdById: ctx.userId,
  };
  const description = `Fuel: ${v.regNumber}, ${litres.toLocaleString("en-GB")} L`;

  if (input.record && ctx.canPostExpenses) {
    let fuelId = "";
    const res = await postExpense(ctx, {
      description, amount: cost, category: "Transport", date, vendor: fuelData.station,
      paymentMethod: input.paymentMethod, receiptUrl: input.receiptUrl, accountId: input.accountId, fundId: input.fundId,
      assetId: v.assetId, source: "fuel",
    }, async (tx, expenseId) => {
      const row = await tx.vehicleFuel.create({ data: { ...fuelData, expenseId }, select: { id: true } });
      fuelId = row.id;
      await tx.expense.update({ where: { id: expenseId }, data: { sourceId: row.id } });
      await bumpOdometer(tx, v.id, odometer);
    });
    if (!res.ok) return res;
    safeRevalidate("/app/vehicles", `/app/vehicles/${v.id}`);
    return { ok: true, id: fuelId, posted: "expense" };
  }

  const out = await db.$transaction(async (tx) => {
    const row = await tx.vehicleFuel.create({ data: fuelData, select: { id: true } });
    await bumpOdometer(tx, v.id, odometer);
    if (input.record) {
      const r = await createRequest(ctx, { description, amount: cost, category: "Transport", vendorName: fuelData.station, accountId: input.accountId, assetId: v.assetId, attachmentUrl: input.receiptUrl, source: "fuel", sourceId: row.id }, tx);
      if (!r.ok) throw new LinkError(r.error);
    }
    return row.id;
  }).catch((e) => (e instanceof LinkError ? { error: e.message } : Promise.reject(e)));
  if (typeof out !== "string") return { ok: false, error: out.error };
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "vehicleFuel", entityId: out, detail: `${description}, GHS ${cost}${input.record ? " (sent for approval)" : ""}` });
  safeRevalidate("/app/vehicles", `/app/vehicles/${v.id}`, "/app/expenses");
  return { ok: true, id: out, posted: input.record ? "request" : "none" };
}
