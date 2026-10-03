import "server-only";
import crypto from "crypto";
import { db } from "@/lib/db";
import { r2Ready, putObject, getObject, deleteObject } from "@/lib/storage";
import { backupKeyReady, buildSnapshot, seal, open } from "./snapshot";

export type BackupTrigger = "auto" | "manual" | "admin" | "pre-restore";

export function backupsConfigured(): boolean {
  return r2Ready && backupKeyReady();
}

async function platformSettings() {
  const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { backupsEnabled: true, backupKeep: true } });
  return { enabled: cfg?.backupsEnabled ?? true, keep: Math.min(60, Math.max(1, cfg?.backupKeep ?? 7)) };
}

/** Snapshot one church, encrypt it, store it in R2 and record the result. */
export async function createBackup(
  churchId: string,
  trigger: BackupTrigger,
): Promise<{ ok: true; id: string; sizeBytes: number; rowCount: number } | { ok: false; error: string }> {
  if (!backupsConfigured()) return { ok: false, error: "Backups are not configured on this server yet." };
  const now = new Date();
  await db.church.update({ where: { id: churchId }, data: { lastBackupAttemptAt: now } });

  try {
    const { data, rowCount } = await buildSnapshot(churchId);
    const sealed = await seal(data);
    const key = `backups/${churchId}/${now.toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(8).toString("hex")}.whqb`;
    await putObject(key, sealed);
    const row = await db.churchBackup.create({
      data: { churchId, trigger, status: "ok", objectKey: key, sizeBytes: sealed.length, rowCount },
    });
    await db.church.update({ where: { id: churchId }, data: { lastBackupAt: now } });
    await prune(churchId);
    return { ok: true, id: row.id, sizeBytes: sealed.length, rowCount };
  } catch (e) {
    const error = (e as Error).message?.slice(0, 300) || "Backup failed.";
    await db.churchBackup.create({ data: { churchId, trigger, status: "failed", error } }).catch(() => {});
    return { ok: false, error };
  }
}

/** Keep the newest N good snapshots (platform setting) and the last few failures. */
async function prune(churchId: string) {
  const { keep } = await platformSettings();
  const ok = await db.churchBackup.findMany({
    where: { churchId, status: "ok" },
    orderBy: { createdAt: "desc" },
    skip: keep,
    select: { id: true, objectKey: true },
  });
  for (const b of ok) {
    if (b.objectKey) await deleteObject(b.objectKey).catch(() => {});
    await db.churchBackup.delete({ where: { id: b.id } }).catch(() => {});
  }
  const failed = await db.churchBackup.findMany({
    where: { churchId, status: "failed" },
    orderBy: { createdAt: "desc" },
    skip: 5,
    select: { id: true },
  });
  if (failed.length) await db.churchBackup.deleteMany({ where: { id: { in: failed.map((f) => f.id) } } });
}

/** Scheduled run: back up every church that opted in and is due, oldest first,
 *  stopping at the time budget so the cron request never times out. Safe to call
 *  hourly - a church is only due once ~a day after its last good backup. */
export async function runScheduledBackups(now = new Date(), budgetMs = 20000) {
  const settings = await platformSettings();
  if (!settings.enabled) return { skipped: "disabled" as const };
  if (!backupsConfigured()) return { skipped: "not-configured" as const };

  const due = await db.church.findMany({
    where: {
      isDemo: false,
      autoBackup: true,
      AND: [
        { OR: [{ lastBackupAt: null }, { lastBackupAt: { lt: new Date(now.getTime() - 23 * 3600000) } }] },
        { OR: [{ lastBackupAttemptAt: null }, { lastBackupAttemptAt: { lt: new Date(now.getTime() - 5 * 3600000) } }] },
      ],
    },
    orderBy: [{ lastBackupAt: { sort: "asc", nulls: "first" } }],
    select: { id: true },
    take: 200,
  });

  const started = Date.now();
  let ok = 0;
  let failed = 0;
  for (const c of due) {
    if (Date.now() - started > budgetMs) break;
    const res = await createBackup(c.id, "auto");
    if (res.ok) ok++;
    else failed++;
  }
  return { due: due.length, ok, failed };
}

export async function deleteBackup(id: string, churchId?: string) {
  const b = await db.churchBackup.findFirst({ where: { id, ...(churchId ? { churchId } : {}) }, select: { id: true, objectKey: true } });
  if (!b) return false;
  if (b.objectKey) await deleteObject(b.objectKey).catch(() => {});
  await db.churchBackup.delete({ where: { id: b.id } });
  return true;
}

/** Decrypted JSON of a stored backup (for download). */
export async function readBackup(id: string) {
  const b = await db.churchBackup.findUnique({ where: { id }, include: { church: { select: { slug: true } } } });
  if (!b || b.status !== "ok" || !b.objectKey) return null;
  const json = await open(await getObject(b.objectKey));
  return { json, churchId: b.churchId, slug: b.church.slug, createdAt: b.createdAt };
}

export const BACKUP_COOLDOWN_MS = 2 * 60 * 1000;

/** The stored, still-encrypted backup file exactly as it sits in R2 (what a church downloads). */
export async function getBackupFile(id: string) {
  const b = await db.churchBackup.findUnique({ where: { id }, include: { church: { select: { slug: true } } } });
  if (!b || b.status !== "ok" || !b.objectKey) return null;
  return { sealed: await getObject(b.objectKey), churchId: b.churchId, slug: b.church.slug, createdAt: b.createdAt };
}
