"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createBackup, deleteBackup, backupsConfigured, BACKUP_COOLDOWN_MS } from "@/lib/backups/run";

async function requireBackupAdmin() {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.role !== "Owner" && session.role !== "Admin") throw new Error("Only an Owner or Admin can manage backups.");
  return session;
}

export async function getBackupOverview() {
  const session = await requireSession();
  const [church, platform, backups] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { autoBackup: true, lastBackupAt: true } }),
    db.platformConfig.findUnique({ where: { id: "default" }, select: { backupsEnabled: true, backupKeep: true } }),
    db.churchBackup.findMany({
      where: { churchId: session.churchId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, trigger: true, status: true, sizeBytes: true, rowCount: true, error: true, createdAt: true },
    }),
  ]);
  return {
    canManage: !session.isDemo && (session.role === "Owner" || session.role === "Admin"),
    configured: backupsConfigured(),
    platformEnabled: platform?.backupsEnabled ?? true,
    keep: platform?.backupKeep ?? 7,
    autoBackup: church?.autoBackup ?? true,
    lastBackupAt: church?.lastBackupAt?.toISOString() ?? null,
    backups: backups.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
  };
}

export async function backUpNow(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireBackupAdmin();
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { lastBackupAttemptAt: true } });
  if (church?.lastBackupAttemptAt && Date.now() - church.lastBackupAttemptAt.getTime() < BACKUP_COOLDOWN_MS) {
    return { ok: false, error: "A backup just ran. Please wait a couple of minutes before starting another." };
  }
  const res = await createBackup(session.churchId, "manual");
  if (!res.ok) return { ok: false, error: res.error };
  await audit(session, "create", "backup", "Ran a manual data backup");
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function setAutoBackup(enabled: boolean): Promise<{ ok: boolean }> {
  const session = await requireBackupAdmin();
  await db.church.update({ where: { id: session.churchId }, data: { autoBackup: enabled } });
  await audit(session, "update", "backup", `Automatic backups turned ${enabled ? "on" : "off"}`);
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function removeBackup(id: string): Promise<{ ok: boolean }> {
  const session = await requireBackupAdmin();
  const ok = await deleteBackup(id, session.churchId);
  if (ok) await audit(session, "delete", "backup", "Deleted a backup", id);
  revalidatePath("/app/settings");
  return { ok };
}
