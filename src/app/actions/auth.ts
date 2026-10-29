"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  getSession,
  startUserSession,
  startDemoSession,
  clearSession,
  renewUserSession,
  rememberDevice,
  isTrustedDevice,
  hashPassword,
  verifyPassword,
  mintLoginChallenge,
  getLoginChallengeUserId,
  LOGIN_CHALLENGE_COOKIE,
  mintResetToken,
  readResetToken,
  clearResetToken,
} from "@/lib/auth";
import { sendOtp, verifyOtp, normalisePhone } from "@/lib/auth/otp";
import { phoneVariants } from "@/lib/phone";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import { rateLimitAll, clientIp, MINUTE } from "@/lib/rate-limit";
import { lockStatus, recordFailure, clearFailures, clearLock, passwordKey, userPasswordKey, codeKey } from "@/lib/lockout";

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
  const city = String(formData.get("city") ?? "").trim().slice(0, 80);
  const country = String(formData.get("country") ?? "Ghana").trim().slice(0, 60) || "Ghana";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const channel = String(formData.get("channel") ?? "phone") === "email" ? "email" : "phone";
  const plan = String(formData.get("plan") ?? "free").trim();
  const validPlans = ["free", "starter", "pro", "max"];
  const chosenPlan = validPlans.includes(plan) ? plan : "free";
  const acceptedTerms = formData.get("acceptedTerms") === "true";

  const { passwordMeetsPolicy } = await import("@/lib/password-policy");
  // Email is always required (it's the login identity). A phone is required only
  // when the member chose to verify by phone. Terms/Privacy acceptance is
  // required from every account, not just paid plans - this is the only point
  // where every church (free tier included) explicitly agrees to them.
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  if (!churchName || city.length < 2 || !name || !emailOk || !passwordMeetsPolicy(password) || (channel === "phone" && !phoneOk) || !acceptedTerms) {
    redirect("/sign-up?error=invalid");
  }
  if (await db.user.findUnique({ where: { email } })) {
    redirect("/sign-up?error=exists");
  }

  const passwordHash = await hashPassword(password);
  const payload = {
    churchName, city, country, name, email, passwordHash,
    phone: phone ? normalisePhone(phone) : "",
    plan: chosenPlan,
    channel,
  };
  const result = channel === "email"
    ? await sendOtp({ channel: "email", email, purpose: "signup", payload })
    : await sendOtp({ channel: "sms", phone, purpose: "signup", payload });

  if (!result.ok || !result.verificationId) {
    redirect(result.limited ? "/sign-up?error=too-many" : "/sign-up?error=sms");
  }

  const store = await cookies();
  store.set(SIGNUP_VID, result.verificationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });

  // In stub mode (no provider keys) surface the code so testing can proceed.
  const via = channel === "email" ? "&via=email" : "";
  redirect(result.devCode ? `/sign-up/verify?dev=${result.devCode}${via}` : `/sign-up/verify?1=1${via}`);
}

/** Step 2 of signup: confirm the code, create the church + Owner, sign in. */
export async function completeSignup(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const store = await cookies();
  const vid = store.get(SIGNUP_VID)?.value;
  if (!vid) redirect("/sign-up?error=expired");

  const result = await verifyOtp(vid, code, { purpose: "signup" });
  if (!result.ok || !result.payload) {
    redirect(`/sign-up/verify?error=${encodeURIComponent(result.error ?? "Invalid code")}`);
  }

  const p = result.payload as {
    churchName: string;
    city?: string;
    country?: string;
    name: string;
    email: string;
    passwordHash: string;
    phone: string;
    plan?: string;
    channel?: string;
  };
  const verifiedByEmail = p.channel === "email";

  // Guard against a race where the email was taken between steps.
  if (await db.user.findUnique({ where: { email: p.email } })) {
    redirect("/sign-up?error=exists");
  }

  const slug = await uniqueSlug(slugify(p.churchName));
  const church = await db.church.create({
    data: {
      slug,
      name: p.churchName,
      city: p.city || null,
      country: p.country || "Ghana",
      termsAcceptedAt: new Date(),
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    include: { branches: true },
  });

  // Every new church starts on Free. A paid plan picked at sign-up is only an intent: the Owner is
  // taken to checkout below and the plan switches on once Paystack confirms the payment.
  // Grace Baptist gets max plan as an offering.
  const isGraceBaptist = p.email.toLowerCase() === "theophanyhouse@gmail.com";
  const chosenPlan = isGraceBaptist ? "max" : "free";
  const intendedPlan = !isGraceBaptist && p.plan && ["starter", "pro", "max"].includes(p.plan) ? p.plan : null;
  await db.subscription.create({
    data: {
      churchId: church.id,
      plan: chosenPlan,
      interval: "monthly",
      status: isGraceBaptist ? "grace" : "active",
    },
  });

  const user = await db.user.create({
    data: {
      churchId: church.id,
      email: p.email,
      name: p.name,
      passwordHash: p.passwordHash,
      phone: p.phone || null,
      // Mark exactly the channel that was verified.
      phoneVerified: !verifiedByEmail && !!p.phone,
      emailVerified: verifiedByEmail,
      role: "Owner",
    },
  });

  // Welcome email to the new owner. Runs after the response is sent, and can never break or slow signup.
  after(async () => {
    try {
      const { alertOwnerOfSignup } = await import("@/lib/outreach/owner-alert");
      await alertOwnerOfSignup(church.id);
    } catch (e) {
      console.error("[signup alert]", (e as Error).message);
    }
    try {
      const { sendWelcome } = await import("@/lib/outreach/send");
      await sendWelcome(church.id, true);
    } catch (e) {
      console.error("[welcome email]", (e as Error).message);
    }
  });

  store.delete(SIGNUP_VID);
  await startUserSession(user.id);
  redirect(intendedPlan ? `/app/settings?tab=billing&upgrade=${intendedPlan}` : "/app");
}

/** Resend the signup verification code. */
export async function resendSignupOtp() {
  const store = await cookies();
  const vid = store.get(SIGNUP_VID)?.value;
  if (!vid) redirect("/sign-up?error=expired");
  const existing = await db.phoneVerification.findUnique({ where: { id: vid } });
  if (!existing || existing.purpose !== "signup") redirect("/sign-up?error=expired");

  const viaEmail = existing.channel === "email";
  const result = await sendOtp({
    channel: viaEmail ? "email" : "sms",
    email: viaEmail ? existing.phone : undefined,
    phone: viaEmail ? undefined : existing.phone,
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
  const via = viaEmail ? "&via=email" : "";
  if (result.limited) redirect(`/sign-up/verify?error=${encodeURIComponent(result.error ?? "Too many codes requested.")}${via}`);
  redirect(result.devCode ? `/sign-up/verify?dev=${result.devCode}${via}` : `/sign-up/verify?resent=1${via}`);
}
export async function startPasswordReset(formData: FormData) {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const isEmail = identifier.includes("@");

  let user;
  if (isEmail) {
    user = await db.user.findUnique({ where: { email: identifier.toLowerCase() } });
  } else {
    user = await db.user.findFirst({
      where: { phone: { in: phoneVariants(identifier) }, phoneVerified: true },
    });
  }

  if (!user) {
    redirect("/sign-in?reset=1&error=not-found");
  }

  // If user has a verified phone, send OTP via SMS (from the platform sender).
  if (user.phone && user.phoneVerified) {
    const result = await sendOtp({
      phone: user.phone,
      purpose: "reset-password",
      userId: user.id,
    });
    if (!result.ok || !result.verificationId) {
      redirect(result.limited ? "/sign-in?reset=1&error=too-many" : "/sign-in?reset=1&error=sms");
    }
    const store = await cookies();
    store.set(RESET_VID, result.verificationId, {
      httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 60 * 15,
    });
    redirect("/sign-in?reset=verify");
  }

  // If no verified phone, send OTP via email
  const result = await sendOtp({ channel: "email", email: user.email, purpose: "reset-password", userId: user.id });
  if (!result.ok || !result.verificationId) {
    redirect(result.limited ? "/sign-in?reset=1&error=too-many" : "/sign-in?reset=1&error=sms");
  }

  const store = await cookies();
  store.set(RESET_VID, result.verificationId, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 15,
  });
  redirect("/sign-in?reset=verify&via=email");
}
export async function verifyResetCode(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();

  const store = await cookies();
  const vid = store.get(RESET_VID)?.value;

  if (!vid) {
    redirect("/sign-in?error=expired");
  }

  const result = await verifyOtp(vid, code, { purpose: "reset-password" });

  if (!result.ok || !result.userId) {
    redirect("/sign-in?reset=verify&error=invalid-code");
  }

  // A signed, one-time token (not a plain cookie anyone could write) carries the confirmed user to the next step.
  store.delete(RESET_VID);
  await mintResetToken(result.userId);

  redirect("/sign-in?reset=new-password");
}
export async function completePasswordReset(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const userId = await readResetToken();
  if (!userId) {
    redirect("/sign-in?error=expired");
  }
  if (password !== confirmPassword) {
    redirect("/sign-in?reset=new-password&error=password-mismatch");
  }
  if (!passwordMeetsPolicy(password)) {
    redirect("/sign-in?reset=new-password&error=weak");
  }

  // Bumping sessionVersion signs the account out everywhere and makes this reset token unusable again.
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      sessionVersion: { increment: 1 },
    },
  });
  await db.phoneVerification.deleteMany({ where: { userId, purpose: "reset-password" } });
  await clearResetToken();
  // Resetting the password is how a locked-out person gets back in: lift both locks.
  const who = await db.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
  if (who) {
    await clearLock(passwordKey(who.email));
    if (who.phone) await clearLock(passwordKey(normalisePhone(who.phone)));
  }
  await clearLock(userPasswordKey(userId));
  await clearLock(codeKey(userId));

  redirect("/sign-in?reset=success");
}

const LOGIN_2FA_VID = "whq_login_vid";

/**
 * Step 1 of login: check the identifier (email OR phone) + password. On success
 * we DON'T send a code yet - we hand off to a channel picker so the user chooses
 * where the code goes (email or their verified phone). This never dead-ends on a
 * single flaky channel. The session is only created once a code is confirmed.
 */
export async function signIn(formData: FormData) {
  const identifier = String(formData.get("identifier") ?? formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect("/sign-in?error=invalid");

  const ip = await clientIp();
  const allowed = await rateLimitAll([
    { key: `signin:id:${identifier.toLowerCase()}`, max: 10, windowMs: 15 * MINUTE },
    { key: `signin:ip:${ip}`, max: 30, windowMs: 15 * MINUTE },
  ]);
  if (!allowed) redirect("/sign-in?error=too-many");

  // Five wrong passwords lock the account for 24 hours. A locked account is refused before the password is even checked.
  const pwKey = passwordKey(identifier.includes("@") ? identifier : normalisePhone(identifier));
  if ((await lockStatus(pwKey)).locked) redirect("/sign-in?error=locked-pw");

  const usingEmail = identifier.includes("@");
  const user = usingEmail
    ? await db.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await db.user.findFirst({ where: { phone: { in: phoneVariants(identifier) } }, orderBy: { phoneVerified: "desc" } });

  // The account is locked as well as the typed email or phone, so switching between them is no way round it.
  if (user && (await lockStatus(userPasswordKey(user.id))).locked) redirect("/sign-in?error=locked-pw");

  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    const f = await recordFailure(pwKey);
    const g = user ? await recordFailure(userPasswordKey(user.id)) : f;
    redirect(f.locked || g.locked ? "/sign-in?error=locked-pw" : `/sign-in?error=invalid&left=${Math.min(f.remaining, g.remaining)}`);
  }
  // A right password, but the sign-in code may have been locked by five wrong codes.
  if ((await lockStatus(codeKey(user.id))).locked) redirect("/sign-in?error=locked-code");
  await clearFailures(pwKey);
  await clearFailures(userPasswordKey(user.id));

  // A browser the person chose to keep after a correct code goes straight in on the password alone.
  if (await isTrustedDevice(user.id)) {
    await startUserSession(user.id);
    redirect("/app");
  }

  // Password OK → mint a short-lived challenge and let them pick a channel.
  const store = await cookies();
  store.set(LOGIN_CHALLENGE_COOKIE, mintLoginChallenge(user.id), {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 15,
  });
  redirect("/sign-in?login=choose");
}

/** Step 2 of login: send the code to the chosen channel (email or phone). */
export async function sendLoginCode(formData: FormData) {
  const channel = String(formData.get("channel") ?? "email") === "email" ? "email" : "sms";
  const uid = await getLoginChallengeUserId();
  if (!uid) redirect("/sign-in?error=expired");

  const user = await db.user.findUnique({
    where: { id: uid },
    select: { id: true, email: true, phone: true, phoneVerified: true },
  });
  if (!user) redirect("/sign-in?error=expired");

  if (channel === "sms" && !(user.phone && user.phoneVerified)) {
    redirect("/sign-in?login=choose&error=no-phone");
  }

  const result = channel === "email"
    ? await sendOtp({ channel: "email", email: user.email, purpose: "login", userId: user.id })
    : await sendOtp({ channel: "sms", phone: user.phone!, purpose: "login", userId: user.id });

  if (!result.ok || !result.verificationId) {
    redirect(result.limited ? "/sign-in?login=choose&error=too-many" : "/sign-in?login=choose&error=send");
  }

  const store = await cookies();
  store.set(LOGIN_2FA_VID, result.verificationId, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 15,
  });
  const via = channel === "email" ? "email" : "phone";
  const dev = result.devCode ? `&dev=${result.devCode}` : "";
  redirect(`/sign-in?login=verify&via=${via}${dev}`);
}

/** Step 3 of login: confirm the code → create the session. */
export async function completeSignIn(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const via = String(formData.get("via") ?? "email") === "email" ? "email" : "phone";
  const store = await cookies();
  const vid = store.get(LOGIN_2FA_VID)?.value;
  const challengeUser = await getLoginChallengeUserId();
  if (!vid || !challengeUser) redirect("/sign-in?error=expired");

  // Five wrong codes, across any number of codes, lock the account for 24 hours.
  if ((await lockStatus(codeKey(challengeUser))).locked) redirect("/sign-in?error=locked-code");
  const result = await verifyOtp(vid, code, { purpose: "login", userId: challengeUser });
  if (!result.ok || !result.userId) {
    const f = await recordFailure(codeKey(challengeUser));
    if (f.locked) redirect("/sign-in?error=locked-code");
    redirect(`/sign-in?login=verify&via=${via}&error=invalid-code&left=${f.remaining}`);
  }
  await clearFailures(codeKey(challengeUser));

  store.delete(LOGIN_2FA_VID);
  store.delete(LOGIN_CHALLENGE_COOKIE);
  await startUserSession(result.userId);
  if (formData.get("remember") === "on") await rememberDevice(result.userId);
  redirect("/app");
}

/** Called when the app opens: gives an active person a fresh 30 days so they are not signed out mid-use. */
export async function renewSession() {
  await renewUserSession();
}

/** Resend the login verification code on the same channel. */
export async function resendLoginOtp() {
  const store = await cookies();
  const vid = store.get(LOGIN_2FA_VID)?.value;
  if (!vid) redirect("/sign-in?error=expired");
  const existing = await db.phoneVerification.findUnique({ where: { id: vid } });
  const challengeUser = await getLoginChallengeUserId();
  if (!existing || !existing.userId || existing.purpose !== "login" || existing.userId !== challengeUser) {
    redirect("/sign-in?error=expired");
  }

  const viaEmail = existing.channel === "email";
  const result = await sendOtp({
    channel: viaEmail ? "email" : "sms",
    email: viaEmail ? existing.phone : undefined,
    phone: viaEmail ? undefined : existing.phone,
    purpose: "login",
    userId: existing.userId,
  });
  if (result.ok && result.verificationId) {
    store.set(LOGIN_2FA_VID, result.verificationId, {
      httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 60 * 15,
    });
  }
  const via = viaEmail ? "email" : "phone";
  const dev = result.devCode ? `&dev=${result.devCode}` : "";
  if (result.limited) redirect(`/sign-in?login=verify&via=${via}&error=too-many`);
  redirect(`/sign-in?login=verify&via=${via}${dev}&resent=1`);
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

  const result = await sendOtp({ phone, purpose: "verify-phone", userId: session!.userId });
  if (!result.ok || !result.verificationId) {
    redirect(result.limited ? "/verify-phone?error=" + encodeURIComponent(result.error ?? "Too many codes requested.") : "/verify-phone?error=sms");
  }

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

  const result = await verifyOtp(vid, code, { purpose: "verify-phone", userId: session!.userId });
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
