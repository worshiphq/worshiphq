"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  getSession,
  startUserSession,
  startDemoSession,
  clearSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { sendOtp, verifyOtp, normalisePhone } from "@/lib/auth/otp";

const SIGNUP_VID = "whq_signup_vid";
const RESET_VID = "whq_reset_vid";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "church"
  );
}

async function uniqueSlug(base: string) {
  let slug = base;
  let n = 1;
  while (await db.church.findUnique({ where: { slug } })) slug = `${base}-${++n}`;
  return slug;
}

/**
 * Step 1 of signup: validate details, send a phone verification code, and stash
 * the pending account in a PhoneVerification record. The account is only created
 * once the code is confirmed (completeSignup).
 */
export async function signUp(formData: FormData) {
  const churchName = String(formData.get("church") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();

  if (!churchName || !name || !email || !phone || password.length < 6) {
    redirect("/sign-up?error=invalid");
  }
  if (await db.user.findUnique({ where: { email } })) {
    redirect("/sign-up?error=exists");
  }

  const passwordHash = await hashPassword(password);
  const result = await sendOtp({
    phone,
    purpose: "signup",
    payload: { churchName, name, email, passwordHash, phone: normalisePhone(phone) },
  });

  if (!result.ok || !result.verificationId) {
    redirect("/sign-up?error=sms");
  }

  const store = await cookies();
  store.set(SIGNUP_VID, result.verificationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });

  // In stub mode (no SMS keys) surface the code so testing can proceed.
  redirect(result.devCode ? `/sign-up/verify?dev=${result.devCode}` : "/sign-up/verify");
}

/** Step 2 of signup: confirm the code, create the church + Owner, sign in. */
export async function completeSignup(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const store = await cookies();
  const vid = store.get(SIGNUP_VID)?.value;
  if (!vid) redirect("/sign-up?error=expired");

  const result = await verifyOtp(vid, code);
  if (!result.ok || !result.payload) {
    redirect(`/sign-up/verify?error=${encodeURIComponent(result.error ?? "Invalid code")}`);
  }

  const p = result.payload as {
    churchName: string;
    name: string;
    email: string;
    passwordHash: string;
    phone: string;
  };

  // Guard against a race where the email was taken between steps.
  if (await db.user.findUnique({ where: { email: p.email } })) {
    redirect("/sign-up?error=exists");
  }

  const slug = await uniqueSlug(slugify(p.churchName));
  const church = await db.church.create({
    data: {
      slug,
      name: p.churchName,
      country: "Ghana",
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    include: { branches: true },
  });

  const user = await db.user.create({
    data: {
      churchId: church.id,
      branchId: church.branches[0]?.id,
      email: p.email,
      name: p.name,
      passwordHash: p.passwordHash,
      phone: p.phone,
      phoneVerified: true,
      role: "Owner",
    },
  });

  store.delete(SIGNUP_VID);
  await startUserSession(user.id);
  redirect("/app");
}

/** Resend the signup verification code. */
export async function resendSignupOtp() {
  const store = await cookies();
  const vid = store.get(SIGNUP_VID)?.value;
  if (!vid) redirect("/sign-up?error=expired");
  const existing = await db.phoneVerification.findUnique({ where: { id: vid } });
  if (!existing) redirect("/sign-up?error=expired");

  const result = await sendOtp({
    phone: existing.phone,
    purpose: "signup",
    payload: existing.payload as Record<string, unknown>,
  });
  if (result.ok && result.verificationId) {
    store.set(SIGNUP_VID, result.verificationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15,
    });
  }
  redirect(result.devCode ? `/sign-up/verify?dev=${result.devCode}` : "/sign-up/verify?resent=1");
}
export async function startPasswordReset(formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();

  const user = await db.user.findFirst({
    where: {
      phone: normalisePhone(phone),
      phoneVerified: true,
    },
  });

  if (!user) {
    redirect("/sign-in?error=phone-not-found");
  }

  const result = await sendOtp({
    phone,
    purpose: "reset-password",
    userId: user.id,
  });

  if (!result.ok || !result.verificationId) {
    redirect("/sign-in?error=sms");
  }

  const store = await cookies();

  store.set(RESET_VID, result.verificationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });

  redirect("/sign-in?reset=verify");
}
export async function verifyResetCode(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();

  const store = await cookies();
  const vid = store.get(RESET_VID)?.value;

  if (!vid) {
    redirect("/sign-in?error=expired");
  }

  const result = await verifyOtp(vid, code);

  if (!result.ok || !result.userId) {
    redirect("/sign-in?reset=verify&error=invalid-code");
  }

  store.set("whq_reset_user", result.userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });

  redirect("/sign-in?reset=new-password");
}
export async function completePasswordReset(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (password.length < 6) {
    redirect("/sign-in?error=password-too-short");
  }

  const store = await cookies();
  const vid = store.get(RESET_VID)?.value;

  if (!vid) {
    redirect("/sign-in?error=expired");
  }

  const result = await verifyOtp(vid, code);

  if (!result.ok || !result.userId) {
    redirect("/sign-in?error=invalid-code");
  }

  await db.user.update({
    where: { id: result.userId },
    data: {
      passwordHash: await hashPassword(password),
    },
  });

  store.delete(RESET_VID);

  redirect("/sign-in?reset=success");
}

/** Sign in an existing user. */
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/sign-in?error=invalid");
  }
  await startUserSession(user.id);
  redirect("/app");
}

/** Enter the read-only demo church (no account needed). */
export async function enterDemo() {
  await startDemoSession();
  redirect("/app");
}

export async function signOut() {
  await clearSession();
  redirect("/sign-in");
}

const LOGIN_VID = "whq_verify_vid";

/** Invited teammate verifies their phone (gate on first login). Sends a code. */
export async function startPhoneVerify(formData: FormData) {
  const session = await getSession();
  if (!session || session.isDemo || session.impersonating) redirect("/sign-in");

  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) redirect("/verify-phone?error=" + encodeURIComponent("Enter your phone number"));

  const result = await sendOtp({ phone, purpose: "login", userId: session!.userId });
  if (!result.ok || !result.verificationId) redirect("/verify-phone?error=sms");

  const store = await cookies();
  store.set(LOGIN_VID, result.verificationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
  redirect(result.devCode ? `/verify-phone?dev=${result.devCode}` : "/verify-phone?sent=1");
}

/** Confirm the teammate's phone code → mark verified. */
export async function confirmPhoneVerify(formData: FormData) {
  const session = await getSession();
  if (!session || session.isDemo || session.impersonating) redirect("/sign-in");

  const code = String(formData.get("code") ?? "").trim();
  const store = await cookies();
  const vid = store.get(LOGIN_VID)?.value;
  if (!vid) redirect("/verify-phone?error=" + encodeURIComponent("Request a new code"));

  const result = await verifyOtp(vid, code);
  if (!result.ok) redirect(`/verify-phone?error=${encodeURIComponent(result.error ?? "Invalid code")}`);

  await db.user.update({
    where: { id: session!.userId },
    data: { phone: result.phone, phoneVerified: true },
  });
  store.delete(LOGIN_VID);
  revalidatePath("/app", "layout");
  redirect("/app");
}

/** Switch the signed-in user's active branch. */
export async function switchBranch(branchName: string) {
  const session = await getSession();
  if (!session || session.isDemo) return;
  const branch = await db.branch.findFirst({
    where: { churchId: session.churchId, name: branchName },
  });
  if (branch) {
    await db.user.update({ where: { id: session.userId }, data: { branchId: branch.id } });
    revalidatePath("/app", "layout");
  }
}
