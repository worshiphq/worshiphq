"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkSuperAdmin, startSuperAdminSession } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import {
  saEmail, saPhone, saTwoFactorOn, saveSaPassword,
  getLoginState, setLoginState, clearLoginState,
  getResetState, setResetState, clearResetState,
} from "@/lib/superadmin-security";

/**
 * Platform owner sign-in. Three steps, like everyone else's, but stricter:
 *   1. email + password
 *   2. a 6-digit code sent to the owner's email or phone
 *   3. the session starts
 * Forgot password needs a code on the email AND on the phone, then a new password, and signs every earlier session out.
 */

const MIN_PASSWORD = 12;

/** Tell the owner something security-related happened. Never throws and never blocks the sign-in. */
async function alertOwner(subject: string, text: string) {
  try {
    await sendEmail({ to: saEmail(), subject, html: `<p>${text}</p><p style="color:#888;font-size:12px">If this was not you, reset your password now at /admin/forgot.</p>` });
  } catch (e) {
    console.error("[admin alert email]", (e as Error).message);
  }
  try {
    const phone = await saPhone();
    if (phone) await sendSms(phone, `${text} If this was not you, reset your password now.`, { heading: null });
  } catch (e) {
    console.error("[admin alert sms]", (e as Error).message);
  }
}

// ── Sign in ──

export async function superAdminSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // This login opens every church, so guessing is capped hard: 5 tries per 15 minutes and 30 a day per address.
  const { rateLimitAll, clientIp, MINUTE, DAY } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-login:ip:${ip}`, max: 5, windowMs: 15 * MINUTE },
    { key: `sa-login:ip-d:${ip}`, max: 30, windowMs: DAY },
  ]);
  if (!allowed) redirect("/admin/login?error=too-many");
  if (!(await checkSuperAdmin(email, password))) {
    console.warn(`[admin] failed SuperAdmin sign-in from ${ip}`);
    redirect("/admin/login?error=invalid");
  }
  if (!saTwoFactorOn()) {
    console.warn(`[admin] SuperAdmin signed in WITHOUT a code (SUPERADMIN_2FA=off) from ${ip}`);
    await startSuperAdminSession();
    redirect("/admin");
  }
  // The password is right. Now prove it is really the owner: a code to their own email or phone.
  await setLoginState({});
  redirect("/admin/login/verify");
}

/** Send the sign-in code to the owner's email or phone. */
export async function sendSuperAdminCode(formData: FormData) {
  if (!(await getLoginState())) redirect("/admin/login?error=expired");
  const channel = String(formData.get("channel") ?? "email") === "sms" ? "sms" : "email";
  const phone = channel === "sms" ? await saPhone() : "";
  if (channel === "sms" && !phone) redirect("/admin/login/verify?error=no-phone");

  const res = channel === "email"
    ? await sendOtp({ channel: "email", email: saEmail(), purpose: "sa-login", userId: "sa" })
    : await sendOtp({ channel: "sms", phone, purpose: "sa-login", userId: "sa" });
  if (!res.ok || !res.verificationId) redirect(`/admin/login/verify?error=${res.limited ? "too-many" : "send"}`);
  if (res.devCode) console.info(`[admin] sign-in code (local testing only): ${res.devCode}`);

  await setLoginState({ vid: res.verificationId, ch: channel });
  redirect(`/admin/login/verify?sent=${channel}`);
}

/** Check the code. Right code: the session starts. */
export async function verifySuperAdminCode(formData: FormData) {
  const state = await getLoginState();
  if (!state) redirect("/admin/login?error=expired");
  if (!state.vid) redirect("/admin/login/verify");

  const { rateLimitAll, clientIp, MINUTE, HOUR } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-otp:ip:${ip}`, max: 10, windowMs: 15 * MINUTE },
    { key: `sa-otp:all`, max: 30, windowMs: HOUR },
  ]);
  if (!allowed) redirect("/admin/login/verify?error=too-many");

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const result = await verifyOtp(state.vid, code, { purpose: "sa-login", userId: "sa" });
  if (!result.ok) {
    console.warn(`[admin] wrong SuperAdmin code from ${ip}`);
    redirect(`/admin/login/verify?sent=${state.ch ?? "email"}&error=code`);
  }

  await clearLoginState();
  await startSuperAdminSession();
  console.info(`[admin] SuperAdmin signed in from ${ip}`);
  // An email every time, so a sign-in you did not make is never silent.
  after(() => alertOwner("SuperAdmin sign-in", `WorshipHQ SuperAdmin was just signed in from ${ip} at ${new Date().toUTCString()}.`));
  redirect("/admin");
}

/** Go back to the password step. */
export async function cancelSuperAdminSignIn() {
  await clearLoginState();
  redirect("/admin/login");
}

// ── Forgot password ──

/** Step 1: the owner's email. If it matches, a code goes to the email AND the phone. The page looks the same either way. */
export async function startSuperAdminReset(formData: FormData) {
  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  const { rateLimitAll, clientIp, HOUR, DAY } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-reset:ip:${ip}`, max: 4, windowMs: HOUR },
    { key: `sa-reset:all`, max: 8, windowMs: DAY },
  ]);
  if (!allowed) redirect("/admin/forgot?error=too-many");

  let ve = "none";
  let vs: string | null = null;
  if (typed === saEmail()) {
    const em = await sendOtp({ channel: "email", email: saEmail(), purpose: "sa-reset-email", userId: "sa" });
    if (em.devCode) console.info(`[admin] reset email code (local testing only): ${em.devCode}`);
    ve = em.verificationId ?? "none";
    const phone = await saPhone();
    if (phone) {
      const sm = await sendOtp({ channel: "sms", phone, purpose: "sa-reset-sms", userId: "sa" });
      if (sm.devCode) console.info(`[admin] reset text code (local testing only): ${sm.devCode}`);
      vs = sm.verificationId ?? "none";
    }
    console.warn(`[admin] SuperAdmin password reset started from ${ip}`);
  } else {
    // A different address: answer exactly the same way, so the page never says whose address is the owner's.
    vs = (await saPhone()) ? "none" : null;
  }
  await setResetState({ ve, vs });
  redirect("/admin/forgot?step=codes");
}

/** Step 2: both codes. Each can be confirmed on its own, so one typo does not undo the other. */
export async function confirmSuperAdminReset(formData: FormData) {
  const state = await getResetState();
  if (!state) redirect("/admin/forgot?error=expired");

  const { rateLimitAll, clientIp, MINUTE, HOUR } = await import("@/lib/rate-limit");
  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `sa-reset-otp:ip:${ip}`, max: 10, windowMs: 15 * MINUTE },
    { key: `sa-reset-otp:all`, max: 30, windowMs: HOUR },
  ]);
  if (!allowed) redirect("/admin/forgot?step=codes&error=too-many");

  const next = { ...state };
  const emailCode = String(formData.get("emailCode") ?? "").replace(/\s/g, "");
  const smsCode = String(formData.get("smsCode") ?? "").replace(/\s/g, "");

  if (!next.eo && emailCode) {
    const r = await verifyOtp(next.ve, emailCode, { purpose: "sa-reset-email", userId: "sa" });
    if (r.ok) next.eo = true;
  }
  if (next.vs !== null && !next.so && smsCode) {
    const r = await verifyOtp(next.vs, smsCode, { purpose: "sa-reset-sms", userId: "sa" });
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

/** Step 3: choose the new password. Every earlier SuperAdmin session, and any open emergency entry, ends. */
export async function setNewSuperAdminPassword(formData: FormData) {
  const state = await getResetState();
  if (!state?.ok) redirect("/admin/forgot?error=expired");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) redirect("/admin/reset?error=short");
  if (password !== confirm) redirect("/admin/reset?error=match");

  try {
    await saveSaPassword(await bcrypt.hash(password, 12));
  } catch (e) {
    console.error("[admin] could not save the new password:", (e as Error).message);
    redirect("/admin/reset?error=setup");
  }
  await db.supportAccess.updateMany({ where: { status: "active" }, data: { status: "ended", endedAt: new Date() } }).catch(() => {});
  await clearResetState();
  await clearLoginState();
  after(() => alertOwner("SuperAdmin password changed", "The WorshipHQ SuperAdmin password was just changed, and every earlier sign-in was ended."));
  redirect("/admin/login?reset=1");
}
