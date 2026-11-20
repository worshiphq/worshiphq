import "server-only";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

/**
 * Self-service church deletion.
 *
 * Like the big platforms, a deletion is not instant: the church is closed straight away, kept for
 * RECOVERY_DAYS so the Main Admin can change their mind, then permanently deleted by the daily cron.
 * Copies in backups are gone within BACKUP_PURGE_DAYS (our backups roll over well inside that).
 */
export const RECOVERY_DAYS = 30;
export const BACKUP_PURGE_DAYS = 90;
/** What the Main Admin types to start a deletion. */
export const DELETE_PHRASE = "delete my app";

export const deletionDate = (from = new Date()) => new Date(from.getTime() + RECOVERY_DAYS * 86_400_000);

/**
 * Daily: permanently delete churches whose recovery window has passed.
 * Backup files are removed from storage first (the database rows cascade with the church).
 */
export async function purgeDeletedChurches(now = new Date()): Promise<{ deleted: number }> {
  const due = await db.church.findMany({
    where: { deleteAfter: { lte: now }, deletionRequestedAt: { not: null }, isDemo: false },
    select: { id: true, name: true, backups: { select: { objectKey: true } } },
    take: 20,
  });
  let deleted = 0;
  for (const c of due) {
    for (const b of c.backups) if (b.objectKey) await deleteObject(b.objectKey).catch(() => {});
    await db.church.delete({ where: { id: c.id } }).then(() => { deleted++; }).catch((e) => console.error("[church-deletion]", c.id, e));
  }
  return { deleted };
}
