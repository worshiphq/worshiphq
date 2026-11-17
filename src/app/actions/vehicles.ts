"use server";

import { revalidatePath } from "next/cache";
import { requireManage, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { logAudit } from "@/lib/audit";
import { ownedId } from "@/lib/tenant";
import { ctxFrom } from "@/lib/expenses/post";
import * as fleet from "@/lib/fleet/service";
import { str, strOrNull, num, dateOf, dateTimeOf, bool, errorText } from "@/lib/form-read";
import { readPhoto } from "@/lib/uploads/photo-field";

export type ActionResult = { ok: boolean; error?: string; id?: string; posted?: "expense" | "request" | "none" };

async function writer() {
  const session = await requireManage("vehicles");
  assertCanWrite(session, "vehicles");
  return session;
}

const done = (r: { ok: true; id: string } | { ok: false; error: string }): ActionResult => (r.ok ? { ok: true, id: r.id } : r);

export async function saveVehicle(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const photo = await readPhoto(fd, "photo", "vehicles");
    if (!photo.ok) return photo;
    return done(await fleet.saveVehicle(ctxFrom(session), {
      id: strOrNull(fd, "id"), name: strOrNull(fd, "name"), regNumber: str(fd, "regNumber"), make: strOrNull(fd, "make"), model: strOrNull(fd, "model"),
      year: num(fd, "year"), colour: strOrNull(fd, "colour"), kind: strOrNull(fd, "kind"), seats: num(fd, "seats"), fuelType: strOrNull(fd, "fuelType"),
      chassisNo: strOrNull(fd, "chassisNo"), odometerKm: num(fd, "odometerKm"), insurer: strOrNull(fd, "insurer"), insurancePolicyNo: strOrNull(fd, "insurancePolicyNo"),
      insuranceType: strOrNull(fd, "insuranceType"), insuranceExpires: dateOf(fd, "insuranceExpires"), roadworthyExpires: dateOf(fd, "roadworthyExpires"),
      registrationExpires: dateOf(fd, "registrationExpires"), notes: strOrNull(fd, "notes"), active: fd.has("active") ? bool(fd, "active") : true,
      photoUrl: photo.value, purchaseDate: dateOf(fd, "purchaseDate"), purchasePrice: num(fd, "purchasePrice"),
    }));
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Only the papers: insurance, roadworthy and DVLA dates and the insurer (the Renew button). */
export async function saveVehiclePapers(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const v = await db.vehicle.findFirst({ where: { id: str(fd, "id"), churchId: session.churchId }, select: { id: true, regNumber: true } });
    if (!v) return { ok: false, error: "That vehicle was not found." };
    const cover = str(fd, "insuranceType");
    await db.vehicle.update({
      where: { id: v.id },
      data: {
        insuranceExpires: dateOf(fd, "insuranceExpires"), roadworthyExpires: dateOf(fd, "roadworthyExpires"), registrationExpires: dateOf(fd, "registrationExpires"),
        insurer: strOrNull(fd, "insurer"), insurancePolicyNo: strOrNull(fd, "insurancePolicyNo"), insuranceType: cover === "comprehensive" || cover === "third-party" ? cover : null,
      },
    });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "vehicle", entityId: v.id, detail: `Updated papers for ${v.regNumber}` });
    revalidatePath("/app/vehicles");
    revalidatePath(`/app/vehicles/${v.id}`);
    return { ok: true, id: v.id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Remove a vehicle: deletes its asset row, which takes its trips, fuel, drivers and papers with it (all kept in the bin). */
export async function deleteVehicle(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const v = await db.vehicle.findFirst({ where: { id: str(fd, "id"), churchId: session.churchId }, select: { id: true, assetId: true, regNumber: true } });
    if (!v) return { ok: false, error: "That vehicle was not found." };
    await moveToBin(session, "vehicle", "Asset", v.assetId, { label: `Vehicle ${v.regNumber}` });
    await db.asset.deleteMany({ where: { id: v.assetId, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "vehicle", entityId: v.id, detail: `Removed vehicle ${v.regNumber}` });
    revalidatePath("/app/vehicles");
    revalidatePath("/app/assets");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function saveDriver(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    return done(await fleet.saveDriver(ctxFrom(session), {
      id: strOrNull(fd, "id"), vehicleId: str(fd, "vehicleId"), personId: strOrNull(fd, "personId"), name: strOrNull(fd, "name"), phone: strOrNull(fd, "phone"),
      licenceNo: strOrNull(fd, "licenceNo"), licenceClass: strOrNull(fd, "licenceClass"), licenceExpires: dateOf(fd, "licenceExpires"), isPrimary: bool(fd, "isPrimary"),
    }));
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function removeDriver(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const id = await ownedId("vehicleDriver", str(fd, "id"), session.churchId);
    if (!id) return { ok: false, error: "That driver was not found." };
    const d = await db.vehicleDriver.findFirst({ where: { id }, select: { name: true, vehicleId: true } });
    await moveToBin(session, "vehicleDriver", "VehicleDriver", id);
    await db.vehicleDriver.deleteMany({ where: { id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "vehicleDriver", entityId: id, detail: `Removed driver ${d?.name ?? ""}` });
    if (d) revalidatePath(`/app/vehicles/${d.vehicleId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

const tripFields = (fd: FormData) => ({
  vehicleId: str(fd, "vehicleId"), driverId: strOrNull(fd, "driverId"), driverName: strOrNull(fd, "driverName"), purpose: strOrNull(fd, "purpose"),
  destination: strOrNull(fd, "destination"), odometerStart: num(fd, "odometerStart"), odometerEnd: num(fd, "odometerEnd"),
  startAt: dateTimeOf(fd, "startAt"), endAt: dateTimeOf(fd, "endAt"), passengers: num(fd, "passengers"), eventId: strOrNull(fd, "eventId"), note: strOrNull(fd, "note"),
});

export async function startTrip(fd: FormData): Promise<ActionResult> {
  try { return done(await fleet.startTrip(ctxFrom(await writer()), tripFields(fd))); } catch (e) { return { ok: false, error: errorText(e) }; }
}

export async function endTrip(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    return done(await fleet.endTrip(ctxFrom(session), str(fd, "tripId"), { odometerEnd: num(fd, "odometerEnd"), passengers: num(fd, "passengers"), note: strOrNull(fd, "note") }));
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function logTrip(fd: FormData): Promise<ActionResult> {
  try { return done(await fleet.logTrip(ctxFrom(await writer()), tripFields(fd))); } catch (e) { return { ok: false, error: errorText(e) }; }
}

export async function deleteTrip(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const id = await ownedId("vehicleTrip", str(fd, "id"), session.churchId);
    if (!id) return { ok: false, error: "That trip was not found." };
    await moveToBin(session, "vehicleTrip", "VehicleTrip", id);
    await db.vehicleTrip.deleteMany({ where: { id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "vehicleTrip", entityId: id, detail: "Deleted a trip" });
    revalidatePath("/app/vehicles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function logFuel(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const receipt = await readPhoto(fd, "receipt", "receipts");
    if (!receipt.ok) return receipt;
    const r = await fleet.logFuel(ctxFrom(session), {
      vehicleId: str(fd, "vehicleId"), date: dateOf(fd, "date"), litres: num(fd, "litres") ?? 0, cost: num(fd, "cost") ?? 0, odometer: num(fd, "odometer"),
      station: strOrNull(fd, "station"), fullTank: fd.has("fullTank") ? bool(fd, "fullTank") : true, paymentMethod: strOrNull(fd, "paymentMethod"),
      receiptUrl: receipt.value ?? null, accountId: strOrNull(fd, "accountId"), fundId: strOrNull(fd, "fundId"), record: bool(fd, "record"),
    });
    return r.ok ? { ok: true, id: r.id, posted: r.posted } : r;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Remove a fuel entry; optionally the expense it posted too (needs Expenses manage and delete rights). */
export async function deleteFuel(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const fuel = await db.vehicleFuel.findFirst({ where: { id: str(fd, "id"), churchId: session.churchId }, select: { id: true, expenseId: true, vehicleId: true } });
    if (!fuel) return { ok: false, error: "That fuel entry was not found." };
    const alsoExpense = bool(fd, "alsoExpense") && !!fuel.expenseId;
    if (alsoExpense && !canManage(session, "expenses")) return { ok: false, error: "Your role cannot delete expenses. Ask finance to remove the expense." };
    await moveToBin(session, "vehicleFuel", "VehicleFuel", fuel.id);
    if (alsoExpense) await moveToBin(session, "expense", "Expense", fuel.expenseId!);
    await db.vehicleFuel.deleteMany({ where: { id: fuel.id, churchId: session.churchId } });
    if (alsoExpense) await db.expense.deleteMany({ where: { id: fuel.expenseId!, churchId: session.churchId } });
    // A request still waiting for this fuel is withdrawn.
    await db.expenseRequest.updateMany({ where: { churchId: session.churchId, source: "fuel", sourceId: fuel.id, status: { in: ["pending", "approved"] } }, data: { status: "cancelled" } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "vehicleFuel", entityId: fuel.id, detail: `Deleted a fuel entry${alsoExpense ? " and its expense" : ""}` });
    revalidatePath(`/app/vehicles/${fuel.vehicleId}`);
    revalidatePath("/app/expenses");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function setVehicleOdometer(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const v = await db.vehicle.findFirst({ where: { id: str(fd, "vehicleId"), churchId: session.churchId }, select: { id: true, odometerKm: true, regNumber: true } });
    if (!v) return { ok: false, error: "That vehicle was not found." };
    const km = num(fd, "odometerKm");
    if (km == null || km < 0) return { ok: false, error: "Enter the reading in km." };
    if (km < v.odometerKm) return { ok: false, error: `The odometer reading is lower than the last one (${v.odometerKm.toLocaleString("en-GB")} km). Check the number.` };
    await fleet.bumpOdometer(db, v.id, km);
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "vehicle", entityId: v.id, detail: `Odometer for ${v.regNumber}: ${km} km` });
    revalidatePath(`/app/vehicles/${v.id}`);
    revalidatePath("/app/vehicles");
    return { ok: true, id: v.id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** A photo of a vehicle paper; PDFs go through /api/uploads/asset-document. */
export async function addVehicleDocument(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const v = await db.vehicle.findFirst({ where: { id: str(fd, "vehicleId"), churchId: session.churchId }, select: { id: true, assetId: true } });
    if (!v) return { ok: false, error: "That vehicle was not found." };
    const photo = await readPhoto(fd, "image", "asset-docs");
    if (!photo.ok) return photo;
    if (!photo.value) return { ok: false, error: "Choose a photo." };
    const kind = ["insurance", "roadworthy", "registration", "receipt", "other"].includes(str(fd, "kind")) ? str(fd, "kind") : "other";
    const expiresAt = dateOf(fd, "expiresAt");
    const doc = await db.assetDocument.create({ data: { churchId: session.churchId, assetId: v.assetId, kind, name: str(fd, "name").slice(0, 120) || "Photo", url: photo.value, contentType: "image/jpeg", expiresAt, uploadedById: session.userId }, select: { id: true } });
    if (expiresAt && ["insurance", "roadworthy", "registration"].includes(kind)) {
      const field = kind === "insurance" ? "insuranceExpires" : kind === "roadworthy" ? "roadworthyExpires" : "registrationExpires";
      await db.vehicle.updateMany({ where: { id: v.id, churchId: session.churchId }, data: { [field]: expiresAt } });
    }
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "assetDocument", entityId: doc.id, detail: "Added a vehicle paper" });
    revalidatePath(`/app/vehicles/${v.id}`);
    return { ok: true, id: doc.id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteVehicleDocument(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const doc = await db.assetDocument.findFirst({ where: { id: str(fd, "id"), churchId: session.churchId, asset: { vehicle: { isNot: null } } }, select: { id: true, name: true, asset: { select: { vehicle: { select: { id: true } } } } } });
    if (!doc) return { ok: false, error: "That document was not found." };
    await moveToBin(session, "assetDocument", "AssetDocument", doc.id);
    await db.assetDocument.deleteMany({ where: { id: doc.id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "assetDocument", entityId: doc.id, detail: `Removed document "${doc.name}"` });
    if (doc.asset.vehicle) revalidatePath(`/app/vehicles/${doc.asset.vehicle.id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
