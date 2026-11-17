"use server";

import { revalidatePath } from "next/cache";
import { requireManage, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { logAudit } from "@/lib/audit";
import { ownedId } from "@/lib/tenant";
import { ctxFrom } from "@/lib/expenses/post";
import * as svc from "@/lib/assets/service";
import { STATUS_KEYS, DOCUMENT_KIND_KEYS } from "@/lib/assets/categories";
import { str, strOrNull, num, dateOf, bool, errorText } from "@/lib/form-read";
import { readPhoto } from "@/lib/uploads/photo-field";
import { storeImage } from "@/lib/storage";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function writer() {
  const session = await requireManage("assets");
  assertCanWrite(session, "assets");
  return session;
}

/** Add or edit an item in the register. */
export async function saveAsset(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const photo = await readPhoto(fd, "photo", "assets");
    if (!photo.ok) return photo;
    const res = await svc.saveAsset(ctxFrom(session), {
      id: strOrNull(fd, "id"),
      name: str(fd, "name"),
      category: str(fd, "category"),
      condition: str(fd, "condition"),
      status: strOrNull(fd, "status"),
      quantity: num(fd, "quantity"),
      serialNo: strOrNull(fd, "serialNo"),
      location: strOrNull(fd, "location"),
      facilityId: strOrNull(fd, "facilityId"),
      departmentId: strOrNull(fd, "departmentId"),
      custodianId: strOrNull(fd, "custodianId"),
      purchaseDate: dateOf(fd, "purchaseDate"),
      purchasePrice: num(fd, "purchasePrice"),
      supplier: strOrNull(fd, "supplier"),
      warrantyExpires: dateOf(fd, "warrantyExpires"),
      depreciation: bool(fd, "depreciate") ? "straight-line" : "none",
      usefulLifeYears: num(fd, "usefulLifeYears"),
      salvageValue: num(fd, "salvageValue"),
      inServiceDate: dateOf(fd, "inServiceDate"),
      notes: strOrNull(fd, "notes"),
      photoUrl: photo.value,
      recordExpense: bool(fd, "recordExpense") ? { accountId: strOrNull(fd, "accountId"), paymentMethod: strOrNull(fd, "paymentMethod") } : null,
    });
    return res.ok ? { ok: true, id: res.id } : res;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Older callers (ActionDialog) still post here. */
export async function createAsset(fd: FormData): Promise<ActionResult> {
  fd.delete("id");
  return saveAsset(fd);
}

export async function deleteAsset(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    assertCanDelete(session);
    const id = str(fd, "id");
    const asset = await db.asset.findFirst({ where: { id, churchId: session.churchId }, select: { name: true, vehicle: { select: { id: true } } } });
    if (!asset) return { ok: false, error: "That item was not found." };
    if (asset.vehicle) return { ok: false, error: "This is a vehicle. Remove it from the Vehicles page." };
    await moveToBin(session, "asset", "Asset", id);
    await db.asset.deleteMany({ where: { id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "asset", entityId: id, detail: `Deleted asset "${asset.name}"` });
    revalidatePath("/app/assets");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function checkOutAsset(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const res = await svc.checkOut(ctxFrom(session), {
      assetId: str(fd, "assetId"), personId: strOrNull(fd, "personId"), borrowerName: strOrNull(fd, "borrowerName"),
      borrowerPhone: strOrNull(fd, "borrowerPhone"), purpose: strOrNull(fd, "purpose"), dueAt: dateOf(fd, "dueAt"),
      conditionOut: strOrNull(fd, "conditionOut"), note: strOrNull(fd, "note"),
    });
    return res.ok ? { ok: true, id: res.id } : res;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function checkInAsset(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const res = await svc.checkIn(ctxFrom(session), str(fd, "assetId"), strOrNull(fd, "conditionIn"), strOrNull(fd, "note"));
    return res.ok ? { ok: true, id: res.id } : res;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function disposeAsset(fd: FormData): Promise<ActionResult> {
  try {
    const session = await writer();
    const res = await svc.dispose(ctxFrom(session), {
      assetId: str(fd, "assetId"), method: str(fd, "method"), date: dateOf(fd, "date"), amount: num(fd, "amount"),
      accountId: strOrNull(fd, "accountId"), note: strOrNull(fd, "note"),
    });
    return res.ok ? { ok: true, id: res.id } : res;
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** A photo of a paper (already shrunk in the browser). PDFs go through /api/uploads/asset-document. */
export async function addAssetDocument(fd: FormData): Promise<ActionResult> {
  try {
    const session = await requireManage("assets");
    assertCanWrite(session, "assets");
    const assetId = await ownedId("asset", str(fd, "assetId"), session.churchId);
    if (!assetId) return { ok: false, error: "That item was not found." };
    const raw = str(fd, "image");
    if (!raw.startsWith("data:image/")) return { ok: false, error: "Choose a photo." };
    if (raw.length >= 1_800_000) return { ok: false, error: "That photo is too large. Try a smaller one." };
    const url = (await storeImage(raw, "asset-docs")) as string;
    const kind = DOCUMENT_KIND_KEYS.includes(str(fd, "kind")) ? str(fd, "kind") : "other";
    const doc = await db.assetDocument.create({
      data: { churchId: session.churchId, assetId, kind, name: str(fd, "name").slice(0, 120) || "Photo", url, contentType: raw.slice(5, raw.indexOf(";")), expiresAt: dateOf(fd, "expiresAt"), uploadedById: session.userId },
      select: { id: true },
    });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "assetDocument", entityId: doc.id, detail: "Added a document photo" });
    revalidatePath(`/app/assets/${assetId}`);
    return { ok: true, id: doc.id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function deleteAssetDocument(fd: FormData): Promise<ActionResult> {
  try {
    const session = await requireManage("assets");
    assertCanWrite(session, "assets");
    assertCanDelete(session);
    const id = await ownedId("assetDocument", str(fd, "id"), session.churchId);
    if (!id) return { ok: false, error: "That document was not found." };
    await moveToBin(session, "assetDocument", "AssetDocument", id);
    const doc = await db.assetDocument.findFirst({ where: { id }, select: { assetId: true, name: true } });
    await db.assetDocument.deleteMany({ where: { id, churchId: session.churchId } });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "assetDocument", entityId: id, detail: `Removed document "${doc?.name ?? ""}"` });
    if (doc) revalidatePath(`/app/assets/${doc.assetId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function assignMissingTags(ids: string[]): Promise<ActionResult & { count?: number }> {
  try {
    const session = await writer();
    const count = await svc.assignMissingTags(session.churchId, Array.isArray(ids) ? ids.slice(0, 500).map(String) : undefined);
    revalidatePath("/app/assets");
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Move many items at once: room, custodian or status. Every id is checked against this church. */
export async function bulkUpdateAssets(fd: FormData): Promise<ActionResult & { count?: number }> {
  try {
    const session = await writer();
    const ids = String(fd.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
    const owned = (await db.asset.findMany({ where: { id: { in: ids }, churchId: session.churchId }, select: { id: true, status: true } }));
    if (!owned.length) return { ok: false, error: "Choose some items first." };
    const field = str(fd, "field");
    let data: { facilityId?: string | null; location?: string | null; custodianId?: string | null; status?: string } = {};
    if (field === "place") {
      const raw = str(fd, "value");
      if (raw.startsWith("f:")) {
        const facilityId = await ownedId("facility", raw.slice(2), session.churchId);
        if (!facilityId) return { ok: false, error: "That room was not found." };
        data = { facilityId, location: null };
      } else data = { facilityId: null, location: raw || null };
    } else if (field === "custodian") {
      const raw = strOrNull(fd, "value");
      const custodianId = raw ? await ownedId("person", raw, session.churchId) : null;
      if (raw && !custodianId) return { ok: false, error: "That person was not found." };
      data = { custodianId };
    } else if (field === "status") {
      const s = str(fd, "value");
      if (!STATUS_KEYS.includes(s) || ["checked-out", "disposed"].includes(s)) return { ok: false, error: "Choose a status." };
      data = { status: s };
    } else return { ok: false, error: "Choose what to change." };
    // Lent-out and disposed items keep their status: those move through Lend out, Mark returned and Dispose.
    const targets = field === "status" ? owned.filter((a) => !["checked-out", "disposed"].includes(a.status)).map((a) => a.id) : owned.map((a) => a.id);
    const r = await db.asset.updateMany({ where: { id: { in: targets }, churchId: session.churchId }, data });
    await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "asset", detail: `Changed ${field} on ${r.count} items` });
    revalidatePath("/app/assets");
    return { ok: true, count: r.count };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
