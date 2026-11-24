"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { deleteObject, signedPutUrl } from "@/lib/storage";
import { STOCK_PREFIX, readStock, writeStock, type StockItem } from "@/lib/media-stock";

const TYPES: Record<string, { kind: "image" | "video"; type: string }> = {
  jpg: { kind: "image", type: "image/jpeg" }, jpeg: { kind: "image", type: "image/jpeg" }, png: { kind: "image", type: "image/png" },
  webp: { kind: "image", type: "image/webp" }, mp4: { kind: "video", type: "video/mp4" }, webm: { kind: "video", type: "video/webm" },
  mov: { kind: "video", type: "video/quicktime" },
};

/** Step 1 of an upload: links the browser sends the file and its thumbnail to. */
export async function stockUploadLinks(fileName: string) {
  await requireSuperAdmin();
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const t = TYPES[ext];
  if (!t) throw new Error("Upload JPG, PNG, WEBP pictures or MP4, WEBM, MOV videos.");
  const id = randomUUID().slice(0, 12);
  const file = `${t.kind === "video" ? "videos" : "images"}/${id}.${ext}`;
  const thumb = `thumbs/${id}.jpg`;
  return {
    id, file, thumb, kind: t.kind, contentType: t.type,
    fileUrl: await signedPutUrl(STOCK_PREFIX + file, t.type),
    thumbUrl: await signedPutUrl(STOCK_PREFIX + thumb, "image/jpeg"),
  };
}

/** Step 2: once both files are uploaded, list the background. */
export async function stockAddItem(item: Omit<StockItem, "addedAt">) {
  await requireSuperAdmin();
  const m = await readStock(true);
  const clean: StockItem = {
    id: item.id, title: item.title.trim().slice(0, 120) || "Background", category: item.category.trim().slice(0, 60) || "Other",
    kind: item.kind === "video" ? "video" : "image", file: item.file, thumb: item.thumb,
    width: Math.round(item.width) || 1920, height: Math.round(item.height) || 1080,
    seconds: item.seconds ? Math.round(item.seconds) : undefined, bytes: Math.round(item.bytes) || 0,
    credit: item.credit?.trim().slice(0, 300) || undefined, addedAt: new Date().toISOString(),
  };
  await writeStock({ ...m, items: [clean, ...m.items.filter((i) => i.id !== clean.id)] });
  revalidatePath("/admin/stock");
}

export async function stockUpdate(id: string, changes: { title?: string; category?: string; hidden?: boolean; credit?: string }) {
  await requireSuperAdmin();
  const m = await readStock(true);
  await writeStock({
    ...m,
    items: m.items.map((i) => (i.id !== id ? i : {
      ...i,
      ...(changes.title !== undefined && { title: changes.title.trim().slice(0, 120) || i.title }),
      ...(changes.category !== undefined && { category: changes.category.trim().slice(0, 60) || i.category }),
      ...(changes.credit !== undefined && { credit: changes.credit.trim().slice(0, 300) || undefined }),
      ...(changes.hidden !== undefined && { hidden: !!changes.hidden }),
    })),
  });
  revalidatePath("/admin/stock");
}

export async function stockDelete(id: string) {
  await requireSuperAdmin();
  const m = await readStock(true);
  const item = m.items.find((i) => i.id === id);
  if (!item) return;
  await writeStock({ ...m, items: m.items.filter((i) => i.id !== id) });
  await Promise.all([deleteObject(STOCK_PREFIX + item.file), deleteObject(STOCK_PREFIX + item.thumb)].map((p) => p.catch(() => {})));
  revalidatePath("/admin/stock");
}
