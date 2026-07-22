"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, startUserSession } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";

/** Public: the invitee's phone requests a fresh verification code. */
export async function sendInviteCode(token: string) {
  const user = await db.user.findUnique({
    where: { inviteToken: token },
    select: { id: true, phone: true, inviteAcceptedAt: true },
  });
  if (!user || user.inviteAcceptedAt) return { ok: false as const, error: "This invite is no longer valid." };
  if (!user.phone) return { ok: false as const, error: "No phone number on this invite. Ask your admin to re-send it." };

  const res = await sendOtp({ phone: user.phone, purpose: "verify-phone", userId: user.id });
  if (!res.ok) return { ok: false as const, error: res.error ?? "Couldn't send the code. Try again." };
  return { ok: true as const, verificationId: res.verificationId!, devCode: res.devCode };
}

/**
 * Public: accept an invite — verify the phone code, set name/password/photo,
 * then start the session and drop the invitee straight into the app.
 */
export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const verificationId = String(formData.get("verificationId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();

  const user = await db.user.findUnique({ where: { inviteToken: token }, select: { id: true, inviteAcceptedAt: true } });
  if (!user || user.inviteAcceptedAt) return { ok: false as const, error: "This invite is no longer valid." };
  if (!name) return { ok: false as const, error: "Please enter your name." };
  if (password.length < 6) return { ok: false as const, error: "Choose a password of at least 6 characters." };
  if (!verificationId || !code) return { ok: false as const, error: "Enter the code we texted you." };

  const check = await verifyOtp(verificationId, code);
  if (!check.ok) return { ok: false as const, error: check.error ?? "That code didn't match." };

  await db.user.update({
    where: { id: user.id },
    data: {
      name,
      passwordHash: await hashPassword(password),
      photoUrl: photoUrl && photoUrl.startsWith("data:") ? photoUrl : undefined,
      phoneVerified: true,
      inviteAcceptedAt: new Date(),
      inviteToken: null,
    },
  });

  await startUserSession(user.id);
  redirect("/app");
}
