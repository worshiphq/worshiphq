import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { startUserSession } from "@/lib/auth";
import { rateLimitAll, clientIp, MINUTE } from "@/lib/rate-limit";
import {
  GOOGLE_SIGNUP_COOKIE, GOOGLE_STATE_COOKIE, SIGNUP_TTL,
  finishGoogle, googleEnabled, googleRedirectUri, readGoogleState, signPendingSignup,
} from "@/lib/auth/google";

/**
 * Google sends the person back here. An existing account is signed straight in (Google already proved the email,
 * so there is no 6-digit code). A new email goes on to the sign-up questions with the email already confirmed.
 */
export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!googleEnabled()) return to("/sign-in?error=google");

  const saved = readGoogleState(req.cookies.get(GOOGLE_STATE_COOKIE)?.value);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  // Cancelled at Google, or a reply that does not belong to this browser.
  if (!saved || !code || !state || state !== saved.state) {
    const res = to(req.nextUrl.searchParams.get("error") === "access_denied" ? "/sign-in" : "/sign-in?error=google");
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  }

  const allowed = await rateLimitAll([{ key: `google:ip:${await clientIp()}`, max: 30, windowMs: 15 * MINUTE }]);
  if (!allowed) return to("/sign-in?error=too-many");

  const who = await finishGoogle(code, googleRedirectUri(req.nextUrl.origin), saved.verifier, saved.nonce);
  if ("error" in who) {
    const res = to(who.error === "unverified" ? "/sign-in?error=google-unverified" : "/sign-in?error=google");
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  }

  const user = await db.user.findUnique({ where: { email: who.email }, select: { id: true, emailVerified: true, inviteToken: true } });
  if (user) {
    // Google confirmed this email, so it is marked verified. An invited teammate who signs in with Google has accepted the invite.
    if (!user.emailVerified || user.inviteToken) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: true, ...(user.inviteToken ? { inviteToken: null, inviteAcceptedAt: new Date() } : {}) },
      });
    }
    await startUserSession(user.id);
    const res = to("/app");
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  }

  // No account yet: on to the church questions, with the Google identity carried in a signed cookie.
  const res = to(`/sign-up?google=1${saved.plan ? `&plan=${saved.plan}` : ""}`);
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  res.cookies.set(GOOGLE_SIGNUP_COOKIE, signPendingSignup(who), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIGNUP_TTL / 1000,
  });
  return res;
}
