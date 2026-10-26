import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { signToken, readToken } from "@/lib/auth/tokens";
import { getAlertPhone } from "@/lib/outreach/owner-alert";

/**
 * Sign-in security for the platform owner (SuperAdmin): the password override set through "Forgot password",
 * the number that gets text codes, and the short-lived cookies that carry a half-finished sign-in or reset.
 */

const FLOW_TTL = 10 * 60 * 1000;
export const SA_LOGIN_COOKIE = "whq_sa_login";
export const SA_RESET_COOKIE = "whq_sa_reset";

/** The saved password override and the session epoch. If the table has not been created yet, nothing is overridden. */
export async function getSaSecurity(): Promise<{ hash: string | null; epoch: number }> {
  try {
    const row = await db.superAdminSecurity.findUnique({ where: { id: "default" } });
    return { hash: row?.passwordHash ?? null, epoch: row?.epoch ?? 0 };
  } catch {
    return { hash: null, epoch: 0 };
  }
}

/** Save a new SuperAdmin password and sign every earlier SuperAdmin session out. Throws if the table does not exist yet. */
export async function saveSaPassword(hash: string): Promise<void> {
  await db.superAdminSecurity.upsert({
    where: { id: "default" },
    create: { id: "default", passwordHash: hash, epoch: 1 },
    update: { passwordHash: hash, epoch: { increment: 1 } },
  });
}

/** The sign-in code can be skipped only by setting SUPERADMIN_2FA=off in Vercel (for when email and SMS are both down). */
export const saTwoFactorOn = () => (env.SUPERADMIN_2FA ?? "").trim().toLowerCase() !== "off";

/** The inbox that receives codes. */
export const saEmail = () => env.SUPERADMIN_EMAIL.trim().toLowerCase();

/** The phone that receives text codes: SUPERADMIN_PHONE if set (best, it lives outside the app), else the alert or company phone. */
export async function saPhone(): Promise<string> {
  const fixed = (env.SUPERADMIN_PHONE ?? "").trim();
  if (fixed) return fixed;
  return (await getAlertPhone().catch(() => ({ phone: "" }))).phone;
}

export const maskEmail = (email: string) => {
  const [u, d] = email.split("@");
  return d ? `${u.slice(0, 1)}${"•".repeat(Math.max(1, u.length - 1))}@${d}` : email;
};
export const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? phone : `•••• ${digits.slice(-4)}`;
};

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/admin",
  maxAge: FLOW_TTL / 1000,
};

// ── Sign-in: password done, waiting for the code ──
export type LoginState = { vid?: string; ch?: "email" | "sms" };

export async function setLoginState(state: LoginState) {
  (await cookies()).set(SA_LOGIN_COOKIE, signToken("sa-login", { sal: true, ...state }, FLOW_TTL), cookieOpts);
}
export async function getLoginState(): Promise<LoginState | null> {
  const data = readToken<{ sal?: boolean; vid?: string; ch?: string }>("sa-login", (await cookies()).get(SA_LOGIN_COOKIE)?.value);
  if (!data?.sal) return null;
  return { vid: typeof data.vid === "string" ? data.vid : undefined, ch: data.ch === "sms" ? "sms" : data.ch === "email" ? "email" : undefined };
}
export async function clearLoginState() {
  (await cookies()).set(SA_LOGIN_COOKIE, "", { ...cookieOpts, maxAge: 0 });
}

// ── Forgot password: the codes, then the new password ──
export type ResetState = {
  /** Code ids for the email and text codes. A decoy value when the address typed was not the owner's. */
  ve: string;
  vs: string | null;
  /** Which codes have been confirmed so far. */
  eo?: boolean;
  so?: boolean;
  /** Both confirmed: the new password may be set. */
  ok?: boolean;
};

export async function setResetState(state: ResetState) {
  (await cookies()).set(SA_RESET_COOKIE, signToken("sa-reset", { sar: true, ...state }, FLOW_TTL), cookieOpts);
}
export async function getResetState(): Promise<ResetState | null> {
  const d = readToken<{ sar?: boolean } & Partial<ResetState>>("sa-reset", (await cookies()).get(SA_RESET_COOKIE)?.value);
  if (!d?.sar || typeof d.ve !== "string") return null;
  return { ve: d.ve, vs: typeof d.vs === "string" ? d.vs : null, eo: !!d.eo, so: !!d.so, ok: !!d.ok };
}
export async function clearResetState() {
  (await cookies()).set(SA_RESET_COOKIE, "", { ...cookieOpts, maxAge: 0 });
}
