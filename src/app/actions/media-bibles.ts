"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

/** SuperAdmin › Bibles: change who can download a Bible, its details, or switch it off. */
export async function updateMediaBible(
  id: string,
  changes: { name?: string; language?: string; licence?: string; active?: boolean; audience?: "all" | "churches"; churchIds?: string[] },
) {
  await requireSuperAdmin();
  const data: Record<string, unknown> = {};
  if (changes.name !== undefined) data.name = changes.name.trim().slice(0, 200);
  if (changes.language !== undefined) data.language = changes.language.trim().slice(0, 60);
  if (changes.licence !== undefined) data.licence = changes.licence.trim().slice(0, 2000);
  if (changes.active !== undefined) data.active = !!changes.active;
  if (changes.audience !== undefined) data.audience = changes.audience === "churches" ? "churches" : "all";
  if (changes.churchIds !== undefined) data.churchIds = changes.churchIds.filter(Boolean).slice(0, 500);
  await db.mediaBible.update({ where: { id }, data });
  revalidatePath("/admin/bibles");
}

export async function deleteMediaBible(id: string) {
  await requireSuperAdmin();
  const b = await db.mediaBible.findUnique({ where: { id }, select: { objectKey: true } });
  if (!b) return;
  await deleteObject(b.objectKey).catch(() => {});
  await db.mediaBible.delete({ where: { id } });
  revalidatePath("/admin/bibles");
}
