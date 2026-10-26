"use server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth";
import { signToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { normalisePhone } from "@/lib/phone";
import { clearLock, passwordKey, userPasswordKey, codeKey } from "@/lib/lockout";

/** Church accounts, for the SuperAdmin: send a person a password reset link, or lift a 24-hour lock. */

type Result = { ok: true; message: string } | { ok: false; error: string };
const LINK_HOURS = 24;

/** Email and text a one-time password reset link to the account's own address and phone. */
export async function sendAccountResetLink(userId: string): Promise<Result> {
  await requireSuperAdmin();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, sessionVersion: true, church: { select: { name: true } } },
  });
  if (!user) return { ok: false, error: "Account not found." };

  // Bound to the account's session version, which the reset bumps, so the link works once.
  const token = signToken("reset-link", { rl: user.id, sv: user.sessionVersion }, LINK_HOURS * 60 * 60 * 1000);
  const link = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/reset-link?t=${encodeURIComponent(token)}`;
  const first = user.name.split(/\s+/)[0] || "there";

  const sent: string[] = [];
  if (user.email && !user.email.endsWith("@invite.worshiphq.app")) {
    try {
      const r = await sendEmail({
        to: user.email,
        subject: "Reset your WorshipHQ password",
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 8px">Hello ${first},</h2>
          <p style="color:#444">Here is the link to choose a new password for your ${user.church.name} account on WorshipHQ. It works for ${LINK_HOURS} hours, and only once.</p>
          <p><a href="${link}" style="display:inline-block;background:#0d7377;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Choose a new password</a></p>
          <p style="color:#888;font-size:13px">If you did not ask for this, you can ignore it.</p>
        </div>`,
      });
      if (r.ok) sent.push("email");
    } catch (e) {
      console.error("[reset link email]", (e as Error).message);
    }
  }
  if (user.phone) {
    try {
      const r = await sendSms(user.phone, `Hello ${first}, choose a new WorshipHQ password here (works for ${LINK_HOURS} hours, once): ${link}`, { heading: null });
      if (r.ok) sent.push("text");
    } catch (e) {
      console.error("[reset link sms]", (e as Error).message);
    }
  }
  if (!sent.length) return { ok: false, error: "This account has no email or phone that could be reached." };
  return { ok: true, message: `Reset link sent by ${sent.join(" and ")}.` };
}

/** Lift a 24-hour lock on one account, so the person can sign in again now. */
export async function unlockAccount(userId: string): Promise<Result> {
  await requireSuperAdmin();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, phone: true } });
  if (!user) return { ok: false, error: "Account not found." };
  await clearLock(passwordKey(user.email));
  if (user.phone) await clearLock(passwordKey(normalisePhone(user.phone)));
  await clearLock(userPasswordKey(user.id));
  await clearLock(codeKey(user.id));
  return { ok: true, message: "Unlocked. They can sign in again." };
}
