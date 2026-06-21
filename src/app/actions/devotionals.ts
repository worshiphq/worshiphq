"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createDevotional(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  const scripture = String(formData.get("scripture") ?? "").trim() || null;
  const author = String(formData.get("author") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();

  await db.devotional.create({
    data: {
      churchId: session.churchId,
      title,
      body,
      scripture,
      author,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  revalidatePath("/app/devotionals");
}

export async function deleteDevotional(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.devotional.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/devotionals");
}

export async function toggleDevotionalPublished(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const d = await db.devotional.findFirst({ where: { id, churchId: session.churchId }, select: { published: true } });
  if (!d) return;
  await db.devotional.update({ where: { id }, data: { published: !d.published } });
  revalidatePath("/app/devotionals");
}
