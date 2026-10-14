"use server";

import { revalidatePath } from "next/cache";
import { requireModule, requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { logAudit } from "@/lib/audit";

export async function createSermon(formData: FormData) {
  const session = await requireManage("sermons");
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

/** Create or update a sermon (the editor page saves through this). */
export async function saveSermon(input: {
  id?: string; title: string; preacher: string; series: string; scripture: string; date: string;
  audioUrl: string; videoUrl: string; notes: string; published: boolean;
}) {
  const session = await requireManage("sermons");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Give the sermon a title." };
  const url = (v: string) => v.trim() || null;
  const data = {
    title,
    preacher: input.preacher.trim() || null,
    series: input.series.trim() || null,
    scripture: input.scripture.trim() || null,
    notes: input.notes.trim() || null,
    audioUrl: url(input.audioUrl),
    videoUrl: url(input.videoUrl),
    published: input.published,
    ...(input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? { date: new Date(`${input.date}T12:00:00`) } : {}),
  };

  let id = input.id;
  if (id) {
    const res = await db.sermon.updateMany({ where: { id, churchId: session.churchId }, data });
    if (res.count === 0) return { ok: false as const, error: "Sermon not found." };
  } else {
    const created = await db.sermon.create({ data: { churchId: session.churchId, ...data } });
    id = created.id;
  }
  await logAudit({ churchId: session.churchId, userId: session.userId, action: input.id ? "update" : "create", entity: "sermon", entityId: id, detail: `${input.id ? "Updated" : "Added"} sermon "${title}"` });
  revalidatePath("/app/sermons");
  return { ok: true as const, id };
}

export async function deleteSermon(formData: FormData) {
  const session = await requireManage("sermons");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const sermon = await db.sermon.findFirst({ where: { id, churchId: session.churchId }, select: { title: true } });
  await moveToBin(session, "sermon", "Sermon", id);
  await db.sermon.deleteMany({ where: { id, churchId: session.churchId } });
  if (sermon) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "sermon", entityId: id, detail: `Deleted sermon "${sermon.title}"` });
  revalidatePath("/app/sermons");
}

export async function toggleSermonPublished(formData: FormData) {
  const session = await requireManage("sermons");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const sermon = await db.sermon.findFirst({ where: { id, churchId: session.churchId }, select: { published: true } });
  if (!sermon) return;
  await db.sermon.update({ where: { id }, data: { published: !sermon.published } });
  revalidatePath("/app/sermons");
}
