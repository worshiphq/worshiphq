"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { createBackup, runScheduledBackups, deleteBackup } from "@/lib/backups/run";

export async function adminBackUpChurch(churchId: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const res = await createBackup(churchId, "admin");
  revalidatePath("/admin/backups");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function adminSetChurchAutoBackup(churchId: string, enabled: boolean) {
  await requireSuperAdmin();
  await db.church.update({ where: { id: churchId }, data: { autoBackup: enabled } });
  revalidatePath("/admin/backups");
  return { ok: true };
}

export async function adminSaveBackupSettings(input: { enabled: boolean; keep: number }) {
  await requireSuperAdmin();
  const keep = Math.min(60, Math.max(1, Math.round(input.keep) || 7));
  await db.platformConfig.upsert({
    where: { id: "default" },
    update: { backupsEnabled: input.enabled, backupKeep: keep },
    create: { id: "default", backupsEnabled: input.enabled, backupKeep: keep },
  });
  revalidatePath("/admin/backups");
  return { ok: true };
}

/** Run the scheduled batch now. Only churches that are actually due are backed up. */
export async function adminRunDueBackups() {
  await requireSuperAdmin();
  const summary = await runScheduledBackups(new Date(), 45000);
  revalidatePath("/admin/backups");
  return { ok: true, summary };
}

export async function adminDeleteBackup(id: string) {
  await requireSuperAdmin();
  const ok = await deleteBackup(id);
  revalidatePath("/admin/backups");
  return { ok };
}
