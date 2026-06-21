"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const CATEGORIES = ["general", "audio-visual", "musical", "furniture", "vehicle", "IT", "kitchen", "other"];
const CONDITIONS = ["new", "good", "fair", "poor", "decommissioned"];

export async function createAsset(formData: FormData) {
  const session = await requireModule("settings");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const category = String(formData.get("category") ?? "general");
  const condition = String(formData.get("condition") ?? "good");
  const location = String(formData.get("location") ?? "").trim() || null;
  const serialNo = String(formData.get("serialNo") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const purchaseDateStr = String(formData.get("purchaseDate") ?? "").trim();
  const purchasePrice = parseFloat(String(formData.get("purchasePrice") ?? "0")) || null;

  const asset = await db.asset.create({
    data: {
      churchId: session.churchId,
      name,
      category: CATEGORIES.includes(category) ? category : "general",
      condition: CONDITIONS.includes(condition) ? condition : "good",
      location,
      serialNo,
      notes,
      purchasePrice,
      ...(purchaseDateStr ? { purchaseDate: new Date(purchaseDateStr) } : {}),
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "asset", entityId: asset.id, detail: `Added asset "${name}"` });
  revalidatePath("/app/assets");
}

export async function deleteAsset(formData: FormData) {
  const session = await requireModule("settings");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const asset = await db.asset.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  await db.asset.deleteMany({ where: { id, churchId: session.churchId } });
  if (asset) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "asset", entityId: id, detail: `Deleted asset "${asset.name}"` });
  revalidatePath("/app/assets");
}
