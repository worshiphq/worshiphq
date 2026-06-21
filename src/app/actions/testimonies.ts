"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createTestimony(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  const category = String(formData.get("category") ?? "praise").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const anonymous = formData.get("anonymous") === "on";
  const dateStr = String(formData.get("date") ?? "").trim();

  const testimony = await db.testimony.create({
    data: {
      churchId: session.churchId,
      title,
      body,
      category,
      personId,
      anonymous,
      status: "approved",
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "testimony", entityId: testimony.id, detail: `Added testimony "${title}"` });
  revalidatePath("/app/testimonies");
}

export async function deleteTestimony(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const t = await db.testimony.findFirst({ where: { id, churchId: session.churchId }, select: { title: true } });
  await db.testimony.deleteMany({ where: { id, churchId: session.churchId } });
  if (t) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "testimony", entityId: id, detail: `Deleted testimony "${t.title}"` });
  revalidatePath("/app/testimonies");
}

export async function toggleTestimonyStatus(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  await db.testimony.updateMany({ where: { id, churchId: session.churchId }, data: { status } });
  revalidatePath("/app/testimonies");
}
