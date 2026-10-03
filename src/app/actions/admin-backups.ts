"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { createBackup, runScheduledBackups, deleteBackup, getBackupFile } from "@/lib/backups/run";
import { sendEmail } from "@/lib/integrations/email";

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

const MAX_EMAIL_BYTES = 3.5 * 1024 * 1024;

/** Email a backup file to the church's Owner and Admins. Falls back to "use Download" when too big. */
export async function adminEmailBackup(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const file = await getBackupFile(id);
  if (!file) return { ok: false, error: "That backup is not available." };
  if (file.sealed.length > MAX_EMAIL_BYTES) {
    return { ok: false, error: `This file is ${(file.sealed.length / 1024 / 1024).toFixed(1)} MB, too big to email. Use Download and send it another way.` };
  }
  const church = await db.church.findUnique({
    where: { id: file.churchId },
    select: { name: true, users: { where: { role: { in: ["Owner", "Admin"] } }, select: { email: true } } },
  });
  const to = [...new Set((church?.users ?? []).map((u) => u.email).filter((e) => e && !e.endsWith("@invite.worshiphq.app")))];
  if (!church || to.length === 0) return { ok: false, error: "No Owner or Admin email found for this church." };

  const stamp = file.createdAt.toISOString().slice(0, 10);
  const res = await sendEmail({
    to,
    subject: `Your WorshipHQ backup - ${church.name}`,
    html: `<p>Hello,</p><p>Attached is a backup of ${church.name}'s WorshipHQ data from ${stamp}.</p><p>It is encrypted, so it can only be read by WorshipHQ. Keep it somewhere safe. To go back to a saved point, open Settings, then Data backups in WorshipHQ.</p>`,
    attachments: [{ filename: `worshiphq-backup-${file.slug}-${stamp}.whqb`, content: file.sealed }],
    log: { churchId: file.churchId, name: "Backup file sent", segment: "backup" },
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? "The email could not be sent." };
}
