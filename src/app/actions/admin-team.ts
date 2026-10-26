"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSuperAdminOwner } from "@/lib/auth";
import { signToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/integrations/email";
import { clearLock, saPasswordKey, saCodeKey } from "@/lib/lockout";
import { saEmail, getSaAdminById } from "@/lib/superadmin-security";

/**
 * Extra platform admins. Only the owner (the account set up in Vercel) can add, remove, unlock or re-invite them,
 * so an extra admin can never remove the owner or each other.
 */

type Result = { ok: true; message: string } | { ok: false; error: string };
const INVITE_DAYS = 3;

async function sendInvite(admin: { id: string; email: string; name: string; epoch: number }, resend: boolean): Promise<boolean> {
  const token = signToken("sa-invite", { sid: admin.id, ep: admin.epoch }, INVITE_DAYS * 24 * 60 * 60 * 1000);
  const link = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/set-password?t=${encodeURIComponent(token)}`;
  const first = admin.name.split(/\s+/)[0] || "there";
  const r = await sendEmail({
    to: admin.email,
    subject: resend ? "Reset your WorshipHQ admin password" : "You have been added as a WorshipHQ admin",
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">Hello ${first},</h2>
      <p style="color:#444">${resend ? "Here is a link to choose a new password for the WorshipHQ admin area." : "You have been added as an admin of the WorshipHQ platform. Choose your password to get started."} The link works for ${INVITE_DAYS} days, and only once.</p>
      <p><a href="${link}" style="display:inline-block;background:#0d7377;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Choose my password</a></p>
      <p style="color:#888;font-size:13px">When you sign in, a code is sent to this email address, so keep it private. If you were not expecting this, ignore it.</p>
    </div>`,
  });
  return r.ok;
}

/** Add an admin and email them a link to choose their own password. The owner never sees or sets it. */
export async function createSuperAdmin(formData: FormData): Promise<Result> {
  await requireSuperAdminOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 24);
  if (!name) return { ok: false, error: "Type their name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "That email does not look right." };
  if (email === saEmail()) return { ok: false, error: "That is the owner's own address." };
  try {
    const admin = await db.superAdminUser.create({ data: { email, name, phone: phone || null } });
    const sent = await sendInvite(admin, false);
    revalidatePath("/admin/team");
    return { ok: true, message: sent ? `Added. An email with a link to choose a password was sent to ${email}.` : "Added, but the email could not be sent. Use Send a new link." };
  } catch (e) {
    const msg = (e as { code?: string }).code === "P2002" ? "That email is already an admin." : "Could not add them. If the database update has not been run yet, run it first.";
    return { ok: false, error: msg };
  }
}

/** A fresh password link for an admin. It ends their earlier sessions and any older link. */
export async function resendAdminInvite(id: string): Promise<Result> {
  await requireSuperAdminOwner();
  const admin = await getSaAdminById(id);
  if (!admin) return { ok: false, error: "Admin not found." };
  const updated = await db.superAdminUser.update({ where: { id }, data: { epoch: { increment: 1 } } });
  await clearLock(saPasswordKey(admin.email));
  await clearLock(saCodeKey(admin.email));
  const sent = await sendInvite(updated, !!admin.passwordHash);
  revalidatePath("/admin/team");
  return sent ? { ok: true, message: `A new link was sent to ${admin.email}.` } : { ok: false, error: "The email could not be sent." };
}

/** Lift a 24-hour lock on an admin. */
export async function unlockSuperAdmin(id: string): Promise<Result> {
  await requireSuperAdminOwner();
  const admin = await getSaAdminById(id);
  if (!admin) return { ok: false, error: "Admin not found." };
  await clearLock(saPasswordKey(admin.email));
  await clearLock(saCodeKey(admin.email));
  return { ok: true, message: "Unlocked." };
}

/** Remove an admin. Their sign-in stops working at once. The owner cannot be removed this way: it is not in the list. */
export async function removeSuperAdmin(id: string): Promise<Result> {
  await requireSuperAdminOwner();
  const admin = await getSaAdminById(id);
  if (!admin) return { ok: false, error: "Admin not found." };
  await db.superAdminUser.delete({ where: { id } });
  await clearLock(saPasswordKey(admin.email));
  await clearLock(saCodeKey(admin.email));
  revalidatePath("/admin/team");
  return { ok: true, message: `${admin.name} was removed.` };
}
