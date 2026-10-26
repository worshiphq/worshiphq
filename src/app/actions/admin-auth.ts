"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkSuperAdmin, startSuperAdminSession, type SaLogin } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { lockStatus, recordFailure, clearFailures, clearLock, saPasswordKey, saCodeKey } from "@/lib/lockout";
import {
  saEmail, saPhone, saTwoFactorOn, saveSaPassword, resolveSaIdentity, readAdminInvite,
  getLoginState, setLoginState, clearLoginState,
  getResetState, setResetState, clearResetState,
} from "@/lib/superadmin-security";

/**
 * Platform admin sign-in. For the owner and for any extra admin the owner added:
 *   1. email + password (five wrong passwords lock that account for 24 hours)
 *   2. a 6-digit code to that admin's own email or phone (five wrong codes lock it for 24 hours)
 *   3. the session starts
 * Forgot password needs a code on the email AND on the phone (if one is saved), then a new password,
 * and signs that admin's earlier sessions out.
 */

const MIN_PASSWORD = 12;

/** Tell the owner something security-related happened. Never throws and never blocks the sign-in. */
async function alertOwner(subject: string, text: string) {
  try {
    await sendEmail({ to: saEmail(), subject, html: `<p>${text}</p><p style="color:#888;font-size:12px">If this was not you, reset the password now at /admin/forgot.</p>` });
  } catch (e) {
    console.error("[admin alert email]", (e as Error).message);
  }
  try {
    const phone = await saPhone();
    if (phone) await sendSms(phone, `${text} If this was not you, reset the password now.`, { heading: null });
  } catch (e) {
    console.error("[admin alert sms]", (e as Error).message);
  }
}

// ── Sign in ──

export async function superAdminSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  // This login opens every church, so guessing is capped hard.
  const { rateLimitAll, clientIp, MINUTE, DAY } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-login:ip:${ip}`, max: 10, windowMs: 15 * MINUTE },
    { key: `sa-login:ip-d:${ip}`, max: 60, windowMs: DAY },
  ]);
  if (!allowed) redirect("/admin/login?error=too-many");

  // Five wrong passwords lock the account for 24 hours, and a locked account is refused before the password is checked.
  const pwKey = saPasswordKey(email);
  if ((await lockStatus(pwKey)).locked) redirect("/admin/login?error=locked-pw");

  const who: SaLogin | null = await checkSuperAdmin(email, password);
  if (!who) {
    console.warn(`[admin] failed SuperAdmin sign-in from ${ip}`);
    const f = await recordFailure(pwKey);
    redirect(f.locked ? "/admin/login?error=locked-pw" : `/admin/login?error=invalid&left=${f.remaining}`);
  }
  // A right password, but this admin's code may be locked by five wrong codes.
  if ((await lockStatus(saCodeKey(who.email))).locked) redirect("/admin/login?error=locked-code");
  await clearFailures(pwKey);

  if (!saTwoFactorOn()) {
    console.warn(`[admin] ${who.email} signed in WITHOUT a code (SUPERADMIN_2FA=off) from ${ip}`);
    await startSuperAdminSession(who);
    redirect("/admin");
  }
  // The password is right. Now prove it is really them: a code to their own email or phone.
  await setLoginState({ who: who.email });
  redirect("/admin/login/verify");
}

/** Send the sign-in code to the admin's own email or phone. */
export async function sendSuperAdminCode(formData: FormData) {
  const state = await getLoginState();
  if (!state?.who) redirect("/admin/login?error=expired");
  const identity = await resolveSaIdentity(state.who);
  if (!identity) redirect("/admin/login?error=expired");

  const channel = String(formData.get("channel") ?? "email") === "sms" ? "sms" : "email";
  if (channel === "sms" && !identity.phone) redirect("/admin/login/verify?error=no-phone");

  const bind = `sa:${identity.email}`;
  const res = channel === "email"
    ? await sendOtp({ channel: "email", email: identity.email, purpose: "sa-login", userId: bind })
    : await sendOtp({ channel: "sms", phone: identity.phone, purpose: "sa-login", userId: bind });
  if (!res.ok || !res.verificationId) redirect(`/admin/login/verify?error=${res.limited ? "too-many" : "send"}`);
  if (res.devCode) console.info(`[admin] sign-in code (local testing only): ${res.devCode}`);

  await setLoginState({ who: identity.email, vid: res.verificationId, ch: channel });
  redirect(`/admin/login/verify?sent=${channel}`);
}

/** Check the code. Right code: the session starts. Five wrong codes lock the account for 24 hours. */
export async function verifySuperAdminCode(formData: FormData) {
  const state = await getLoginState();
  if (!state?.who) redirect("/admin/login?error=expired");
  if (!state.vid) redirect("/admin/login/verify");
  const identity = await resolveSaIdentity(state.who);
  if (!identity) redirect("/admin/login?error=expired");

  const codeKey = saCodeKey(identity.email);
  if ((await lockStatus(codeKey)).locked) redirect("/admin/login?error=locked-code");

  const { rateLimitAll, clientIp, MINUTE, HOUR } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-otp:ip:${ip}`, max: 20, windowMs: 15 * MINUTE },
    { key: `sa-otp:all`, max: 60, windowMs: HOUR },
  ]);
  if (!allowed) redirect("/admin/login/verify?error=too-many");

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const result = await verifyOtp(state.vid, code, { purpose: "sa-login", userId: `sa:${identity.email}` });
  if (!result.ok) {
    console.warn(`[admin] wrong SuperAdmin code from ${ip}`);
    const f = await recordFailure(codeKey);
    if (f.locked) {
      await clearLoginState();
      redirect("/admin/login?error=locked-code");
    }
    redirect(`/admin/login/verify?sent=${state.ch ?? "email"}&error=code&left=${f.remaining}`);
  }

  await clearFailures(codeKey);
  await clearFailures(saPasswordKey(identity.email));
  await clearLoginState();
  if (identity.kind === "admin") {
    await db.superAdminUser.update({ where: { id: identity.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    await startSuperAdminSession({ kind: "admin", id: identity.id, email: identity.email });
  } else {
    await startSuperAdminSession({ kind: "owner", email: identity.email });
  }
  console.info(`[admin] ${identity.email} signed in from ${ip}`);
  // An email every time, so a sign-in you did not make is never silent.
  after(() => alertOwner("SuperAdmin sign-in", `${identity.kind === "admin" ? identity.name : "The owner"} (${identity.email}) just signed in to WorshipHQ SuperAdmin from ${ip} at ${new Date().toUTCString()}.`));
  redirect("/admin");
}

/** Go back to the password step. */
export async function cancelSuperAdminSignIn() {
  await clearLoginState();
  redirect("/admin/login");
}

// ── Forgot password ──

/** Step 1: the admin's email. If it is one of ours, a code goes to the email AND the phone. The page looks the same either way. */
export async function startSuperAdminReset(formData: FormData) {
  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  const { rateLimitAll, clientIp, HOUR, DAY } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-reset:ip:${ip}`, max: 4, windowMs: HOUR },
    { key: `sa-reset:all`, max: 12, windowMs: DAY },
  ]);
  if (!allowed) redirect("/admin/forgot?error=too-many");

  const identity = await resolveSaIdentity(typed);
  let ve = "none";
  let vs: string | null = null;
  if (identity) {
    const bind = `sa-reset:${identity.email}`;
    const em = await sendOtp({ channel: "email", email: identity.email, purpose: "sa-reset-email", userId: bind });
    if (em.devCode) console.info(`[admin] reset email code (local testing only): ${em.devCode}`);
    ve = em.verificationId ?? "none";
    if (identity.phone) {
      const sm = await sendOtp({ channel: "sms", phone: identity.phone, purpose: "sa-reset-sms", userId: bind });
      if (sm.devCode) console.info(`[admin] reset text code (local testing only): ${sm.devCode}`);
      vs = sm.verificationId ?? "none";
    }
    console.warn(`[admin] SuperAdmin password reset started for ${identity.email} from ${ip}`);
  } else {
    // A different address: answer exactly the same way, so the page never says whose address is ours.
    vs = (await saPhone()) ? "none" : null;
  }
  await setResetState({ who: typed, ve, vs });
  redirect("/admin/forgot?step=codes");
}

/** Step 2: both codes. Each can be confirmed on its own, so one typo does not undo the other. */
export async function confirmSuperAdminReset(formData: FormData) {
  const state = await getResetState();
  if (!state) redirect("/admin/forgot?error=expired");

  const { rateLimitAll, clientIp, MINUTE, HOUR } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-reset-otp:ip:${ip}`, max: 20, windowMs: 15 * MINUTE },
    { key: `sa-reset-otp:all`, max: 60, windowMs: HOUR },
  ]);
  if (!allowed) redirect("/admin/forgot?step=codes&error=too-many");

  const next = { ...state };
  const bind = `sa-reset:${state.who}`;
  const emailCode = String(formData.get("emailCode") ?? "").replace(/\s/g, "");
  const smsCode = String(formData.get("smsCode") ?? "").replace(/\s/g, "");

  if (!next.eo && emailCode) {
    const r = await verifyOtp(next.ve, emailCode, { purpose: "sa-reset-email", userId: bind });
    if (r.ok) next.eo = true;
  }
  if (next.vs !== null && !next.so && smsCode) {
    const r = await verifyOtp(next.vs, smsCode, { purpose: "sa-reset-sms", userId: bind });
    if (r.ok) next.so = true;
  }

  const done = !!next.eo && (next.vs === null || !!next.so);
  if (done) {
    await setResetState({ ...next, ok: true });
    redirect("/admin/reset");
  }
  await setResetState(next);
  console.warn(`[admin] SuperAdmin reset code not accepted from ${ip}`);
  redirect("/admin/forgot?step=codes&error=code");
}

/** Step 3: choose the new password. Earlier sign-ins for that admin end, and any lock is lifted. */
export async function setNewSuperAdminPassword(formData: FormData) {
  const state = await getResetState();
  if (!state?.ok) redirect("/admin/forgot?error=expired");
  const identity = await resolveSaIdentity(state.who);
  if (!identity) redirect("/admin/forgot?error=expired");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) redirect("/admin/reset?error=short");
  if (password !== confirm) redirect("/admin/reset?error=match");

  try {
    const hash = await bcrypt.hash(password, 12);
    if (identity.kind === "owner") await saveSaPassword(hash);
    else await db.superAdminUser.update({ where: { id: identity.id }, data: { passwordHash: hash, epoch: { increment: 1 } } });
  } catch (e) {
    console.error("[admin] could not save the new password:", (e as Error).message);
    redirect("/admin/reset?error=setup");
  }
  await db.supportAccess.updateMany({ where: { status: "active" }, data: { status: "ended", endedAt: new Date() } }).catch(() => {});
  await clearLock(saPasswordKey(identity.email));
  await clearLock(saCodeKey(identity.email));
  await clearResetState();
  await clearLoginState();
  after(() => alertOwner("SuperAdmin password changed", `The WorshipHQ SuperAdmin password for ${identity.email} was just changed, and its earlier sign-ins were ended.`));
  redirect("/admin/login?reset=1");
}

// ── An invite (or a reset sent by the owner) for an extra admin: choose a password from the emailed link ──

export async function acceptAdminInvite(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const admin = await readAdminInvite(token);
  if (!admin) redirect("/admin/login?error=expired");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) redirect(`/admin/set-password?t=${encodeURIComponent(token)}&error=short`);
  if (password !== confirm) redirect(`/admin/set-password?t=${encodeURIComponent(token)}&error=match`);
  // The epoch goes up, so this link works once and any earlier session of this admin ends.
  await db.superAdminUser.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(password, 12), epoch: { increment: 1 } } });
  await clearLock(saPasswordKey(admin.email));
  await clearLock(saCodeKey(admin.email));
  redirect("/admin/login?reset=1");
}
