"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createSermon(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const preacher = String(formData.get("preacher") ?? "").trim() || null;
  const series = String(formData.get("series") ?? "").trim() || null;
  const scripture = String(formData.get("scripture") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const audioUrl = String(formData.get("audioUrl") ?? "").trim() || null;
  const videoUrl = String(formData.get("videoUrl") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();

  const sermon = await db.sermon.create({
    data: {
      churchId: session.churchId,
      title,
      preacher,
      series,
      scripture,
      notes,
      audioUrl,
      videoUrl,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "sermon", entityId: sermon.id, detail: `Added sermon "${title}"` });
  revalidatePath("/app/sermons");
}

export async function deleteSermon(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const sermon = await db.sermon.findFirst({ where: { id, churchId: session.churchId }, select: { title: true } });
  await db.sermon.deleteMany({ where: { id, churchId: session.churchId } });
  if (sermon) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "sermon", entityId: id, detail: `Deleted sermon "${sermon.title}"` });
  revalidatePath("/app/sermons");
}

export async function toggleSermonPublished(formData: FormData) {
  const session = await requireModule("events");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const sermon = await db.sermon.findFirst({ where: { id, churchId: session.churchId }, select: { published: true } });
  if (!sermon) return;
  await db.sermon.update({ where: { id }, data: { published: !sermon.published } });
  revalidatePath("/app/sermons");
}
