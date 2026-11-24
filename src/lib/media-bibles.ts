import "server-only";
import { db } from "@/lib/db";

/** The Bibles a church may download in WorshipHQ Live (newest first). */
export async function biblesForChurch(churchId: string) {
  const rows = await db.mediaBible.findMany({
    where: { active: true, OR: [{ audience: "all" }, { audience: "churches", churchIds: { has: churchId } }] },
    orderBy: [{ language: "asc" }, { name: "asc" }],
    select: { id: true, abbreviation: true, name: true, language: true, format: true, sizeBytes: true, sha256: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function canDownload(bibleId: string, churchId: string) {
  const b = await db.mediaBible.findUnique({ where: { id: bibleId } });
  if (!b || !b.active) return null;
  if (b.audience === "churches" && !b.churchIds.includes(churchId)) return null;
  return b;
}

/** EasyWorship Bible files start with this text. */
export function looksLikeEwb(buf: Buffer): boolean {
  return buf.subarray(0, 22).toString("latin1") === "EasyWorship Bible Text";
}

/** A gzipped file starts with 1F 8B. */
export function looksLikeGzip(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}
