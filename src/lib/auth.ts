import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { type Session, can, ROLE_PERMISSIONS, ALL_MODULES, modulesForRole } from "@/lib/permissions";

export type { Session };
export { can, ROLE_PERMISSIONS };

const COOKIE = "whq_session";
const SECRET = env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";

// ── Signed-cookie helpers (HMAC so the payload can't be tampered) ──
// - { uid }            → a normal church user
// - { demo }           → the read-only demo church
// - { sa }             → the platform SuperAdmin (uses the /admin area)
// - { sa, ghost }      → SuperAdmin impersonating a church (ghost = churchId)
type Payload =
  | { uid: string }
  | { demo: true }
  | { sa: true; ghost?: string };

function sign(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): Payload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

async function setCookie(payload: Payload) {
  const store = await cookies();
  store.set(COOKIE, sign(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// ── Password hashing ──
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// ── Session lifecycle ──
export async function startUserSession(userId: string) {
  await setCookie({ uid: userId });
}
export async function startDemoSession() {
  await setCookie({ demo: true });
}
export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

// ── SuperAdmin (platform owner) ──
/** Verify SuperAdmin credentials against env. Returns false if not configured. */
export function checkSuperAdmin(email: string, password: string): boolean {
  const expectedEmail = env.SUPERADMIN_EMAIL.toLowerCase();
  const expectedPw = env.SUPERADMIN_PASSWORD;
  if (!expectedPw) return false; // login disabled until a password is set
  const emailOk = email.toLowerCase().trim() === expectedEmail;
  // Constant-time password compare.
  const a = Buffer.from(password);
  const b = Buffer.from(expectedPw);
  const pwOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  return emailOk && pwOk;
}

export async function startSuperAdminSession() {
  await setCookie({ sa: true });
}

/** SuperAdmin "magic links" into a church as invisible support. */
export async function startGhostSession(churchId: string) {
  await setCookie({ sa: true, ghost: churchId });
}

/** Leave a church and return to the admin area. */
export async function stopGhostSession() {
  await setCookie({ sa: true });
}

/** Returns the SuperAdmin identity if the current cookie is a SuperAdmin one. */
export async function getSuperAdmin(): Promise<{ email: string; ghost?: string } | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload || !("sa" in payload)) return null;
  return { email: env.SUPERADMIN_EMAIL, ghost: payload.ghost };
}

/** Guard for /admin pages: returns the SuperAdmin or redirects to admin login. */
export async function requireSuperAdmin(): Promise<{ email: string; ghost?: string }> {
  const sa = await getSuperAdmin();
  if (!sa) redirect("/admin/login");
  return sa;
}

/** Current session (null when signed out). Reads a signed cookie and loads the DB user. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;

  if ("demo" in payload) {
    const church = await db.church.findUnique({ where: { slug: "demo" } });
    if (!church) return null;
    return {
      userId: "demo",
      name: "Demo Visitor",
      email: "demo@worshiphq.org",
      role: "Owner",
      churchId: church.id,
      churchName: church.name,
      branch: "Accra Central",
      avatarName: "Demo Visitor",
      isDemo: true,
      sections: [...ALL_MODULES],
      canDelete: true,
    };
  }

  // SuperAdmin impersonating a church → synthesize an Owner session for it.
  // This identity is NOT a row in the church's User table, so it never appears
  // in their team/roles list. The SuperAdmin's email is never exposed here.
  if ("sa" in payload) {
    if (!payload.ghost) return null; // bare superadmin isn't an app session
    const church = await db.church.findUnique({ where: { id: payload.ghost } });
    if (!church) return null;
    return {
      userId: "support",
      name: "WorshipHQ Support",
      email: "",
      role: "Owner",
      churchId: church.id,
      churchName: church.name,
      branch: "All branches",
      avatarName: "WorshipHQ Support",
      isDemo: false,
      impersonating: true,
      sections: [...ALL_MODULES],
      canDelete: true,
    };
  }

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    include: { church: true, branch: true, customRole: true },
  });
  if (!user) return null;

  // Custom role overrides the built-in role's access + delete permission.
  const sections = user.customRole ? user.customRole.sections : modulesForRole(user.role);
  const canDelete = user.customRole ? user.customRole.canDelete : true;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    customRole: user.customRole?.name ?? null,
    sections,
    canDelete,
    churchId: user.churchId,
    churchName: user.church.name,
    branch: user.branch?.name ?? "All branches",
    branchId: user.branchId,
    avatarName: user.name,
    isDemo: user.church.isDemo,
    phoneVerified: user.phoneVerified,
  };
}

/** Use in app pages/actions: returns the session or redirects to sign-in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Guard for write actions — demo church is read-only. */
export class DemoReadOnlyError extends Error {
  constructor() {
    super("This is the read-only demo. Create a free account to make changes.");
  }
}
export function assertCanWrite(session: Session) {
  if (session.isDemo) throw new DemoReadOnlyError();
}

/** Guard for delete actions — blocked for demo and for roles without delete rights. */
export function assertCanDelete(session: Session) {
  if (session.isDemo) throw new DemoReadOnlyError();
  if (!session.canDelete) throw new Error("Your role doesn't have permission to delete records.");
}

/** Require the session to have access to a module/section, else redirect. */
export async function requireModule(module: string): Promise<Session> {
  const session = await requireSession();
  if (module !== "dashboard" && !session.sections.includes(module)) {
    redirect("/app");
  }
  return session;
}

export { COOKIE as SESSION_COOKIE };
