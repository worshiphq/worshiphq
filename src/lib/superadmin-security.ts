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

// ── Who can sign in: the owner (from Vercel) and any extra admins the owner added ──

export type SaAdmin = { id: string; email: string; name: string; phone: string | null; passwordHash: string | null; epoch: number; active: boolean; lastLoginAt: Date | null; createdAt: Date };

/** An extra admin by email. Null if there is none, or if the table has not been created yet. */
export async function getSaAdminByEmail(email: string): Promise<SaAdmin | null> {
  try {
    return await db.superAdminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  } catch {
    return null;
  }
}

export async function getSaAdminById(id: string): Promise<SaAdmin | null> {
  try {
    return await db.superAdminUser.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

/** Every extra admin, and whether the table exists yet. */
export async function listSaAdmins(): Promise<{ ready: boolean; admins: SaAdmin[] }> {
  try {
    return { ready: true, admins: await db.superAdminUser.findMany({ orderBy: { createdAt: "asc" } }) };
  } catch {
    return { ready: false, admins: [] };
  }
}

export type SaIdentity =
  | { kind: "owner"; email: string; name: string; phone: string }
  | { kind: "admin"; id: string; email: string; name: string; phone: string };

/** Who an email belongs to: the owner, an active extra admin, or nobody. */
export async function resolveSaIdentity(email: string): Promise<SaIdentity | null> {
  const e = email.trim().toLowerCase();
  if (e === saEmail()) return { kind: "owner", email: e, name: "Owner", phone: await saPhone() };
  const a = await getSaAdminByEmail(e);
  if (a?.active) return { kind: "admin", id: a.id, email: a.email, name: a.name, phone: a.phone ?? "" };
  return null;
}

/** The admin an invite link is for, if the link is still good (not used, not expired, the admin not removed). */
export async function readAdminInvite(token: string | undefined | null): Promise<SaAdmin | null> {
  const data = readToken<{ sid?: string; ep?: number }>("sa-invite", token);
  if (!data?.sid) return null;
  const admin = await getSaAdminById(data.sid);
  if (!admin || !admin.active || admin.epoch !== data.ep) return null;
  return admin;
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
export type LoginState = { vid?: string; ch?: "email" | "sms"; /** the email of the admin who passed the password step */ who?: string };

export async function setLoginState(state: LoginState) {
  (await cookies()).set(SA_LOGIN_COOKIE, signToken("sa-login", { sal: true, ...state }, FLOW_TTL), cookieOpts);
}
export async function getLoginState(): Promise<LoginState | null> {
  const data = readToken<{ sal?: boolean; vid?: string; ch?: string; who?: string }>("sa-login", (await cookies()).get(SA_LOGIN_COOKIE)?.value);
  if (!data?.sal) return null;
  return {
    vid: typeof data.vid === "string" ? data.vid : undefined,
    ch: data.ch === "sms" ? "sms" : data.ch === "email" ? "email" : undefined,
    who: typeof data.who === "string" ? data.who : undefined,
  };
}
export async function clearLoginState() {
  (await cookies()).set(SA_LOGIN_COOKIE, "", { ...cookieOpts, maxAge: 0 });
}

// ── Forgot password: the codes, then the new password ──
export type ResetState = {
  /** The email the reset was started for (the owner's, or an extra admin's). */
  who: string;
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
  return { who: typeof d.who === "string" ? d.who : "", ve: d.ve, vs: typeof d.vs === "string" ? d.vs : null, eo: !!d.eo, so: !!d.so, ok: !!d.ok };
}
export async function clearResetState() {
  (await cookies()).set(SA_RESET_COOKIE, "", { ...cookieOpts, maxAge: 0 });
}
