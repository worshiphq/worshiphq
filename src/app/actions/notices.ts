"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createNotice(formData: FormData) {
  const session = await requireModule("communications");
  if (session.isDemo) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return;

  const pinned = formData.get("pinned") === "on";

  await db.churchNotice.create({
    data: { churchId: session.churchId, title, body, pinned },
  });

  revalidatePath("/app/notices");
}

export async function togglePinNotice(formData: FormData) {
  const session = await requireModule("communications");
  const id = String(formData.get("id"));

  const notice = await db.churchNotice.findFirst({
    where: { id, churchId: session.churchId },
    select: { pinned: true },
  });
  if (!notice) return;

  await db.churchNotice.update({
    where: { id },
    data: { pinned: !notice.pinned },
  });

  revalidatePath("/app/notices");
}

export async function deleteNotice(formData: FormData) {
  const session = await requireModule("communications");
  const id = String(formData.get("id"));

  await db.churchNotice.deleteMany({
    where: { id, churchId: session.churchId },
  });

  revalidatePath("/app/notices");
}
