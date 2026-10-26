import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { type Session, can, ROLE_PERMISSIONS, ALL_MODULES, modulesForRole, hasSection, canManage } from "@/lib/permissions";
import { authSecret, safeEqual, signToken, readToken } from "@/lib/auth/tokens";
import { commsTrial, featureForSection, planHasFeature, ALL_FEATURES, CORE_FEATURES, FEATURE_LABELS, getMinimumPlan, type PlanId } from "@/lib/plan-gate";

export type { Session };
export { can, ROLE_PERMISSIONS };

const COOKIE = "whq_session";
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SUPERADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

// ── Signed-cookie helpers (HMAC so the payload can't be tampered) ──
// - { uid, sv }        → a normal church user (sv = the user's sessionVersion when they signed in)
// - { demo }           → the read-only demo church
// - { sa }             → the platform SuperAdmin (uses the /admin area)
// - { sa, ghost }      → SuperAdmin impersonating a church (ghost = churchId)
// Every new cookie also carries exp. Cookies from before exp existed stay valid for users and the demo only.
type Payload =
  | { uid: string; sv: number }
  | { demo: true }
  | { sa: true; ghost?: string; until?: number; rid?: string; se?: number };

function sign(payload: Payload, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  const mac = crypto.createHmac("sha256", authSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): Payload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", authSecret()).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  // Only web-session shapes. Anything carrying another token's fields (a desktop login, a plan stamp,
  // a login challenge) is refused, so it can never be replayed as a browser session.
  if ("cid" in p || "lc" in p || "rp" in p || "plan" in p || "sal" in p || "sar" in p) return null;
  if (typeof p.exp === "number" && p.exp < Date.now()) return null;
  if (p.demo === true) return { demo: true };
  if (p.sa === true) {
    if (typeof p.exp !== "number") return null; // SuperAdmin cookies must expire
    return {
      sa: true,
      ghost: typeof p.ghost === "string" ? p.ghost : undefined,
      until: typeof p.until === "number" ? p.until : undefined,
      rid: typeof p.rid === "string" ? p.rid : undefined,
      se: typeof p.se === "number" ? p.se : undefined,
    };
  }
  if (typeof p.uid === "string" && p.uid) return { uid: p.uid, sv: typeof p.sv === "number" ? p.sv : 0 };
  return null;
}

// ── Login challenge (interstitial between password and the 2FA code) ──
// A short-lived signed token that proves "the password was verified for this
// user" while they choose a channel and enter the code. No DB row needed.
const LOGIN_CHALLENGE_COOKIE = "whq_login_challenge";
const LOGIN_CHALLENGE_TTL = 15 * 60 * 1000;

export function mintLoginChallenge(userId: string): string {
  return signToken("login-challenge", { lc: userId }, LOGIN_CHALLENGE_TTL);
}

function readLoginChallenge(token: string | undefined): string | null {
  const data = readToken<{ lc?: string }>("login-challenge", token);
  return typeof data?.lc === "string" ? data.lc : null;
}

// ── Password reset (after the emailed or texted code is confirmed) ──
// Signed, short-lived and bound to the user's sessionVersion, which the reset itself bumps,
// so a reset token works exactly once.
const RESET_COOKIE = "whq_reset_token";
const RESET_TTL = 15 * 60 * 1000;

export async function mintResetToken(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  if (!user) return;
  const store = await cookies();
  store.set(RESET_COOKIE, signToken("reset", { rp: userId, sv: user.sessionVersion }, RESET_TTL), {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: RESET_TTL / 1000,
  });
}

/** The user a confirmed reset code belongs to, or null if the token is missing, expired or already used. */
export async function readResetToken(): Promise<string | null> {
  const store = await cookies();
  const data = readToken<{ rp?: string; sv?: number }>("reset", store.get(RESET_COOKIE)?.value);
  if (typeof data?.rp !== "string") return null;
  const user = await db.user.findUnique({ where: { id: data.rp }, select: { sessionVersion: true } });
  if (!user || user.sessionVersion !== data.sv) return null;
  return data.rp;
}

export async function clearResetToken() {
  const store = await cookies();
  store.delete(RESET_COOKIE);
}

/** Sign the user out of every browser and device: their existing sessions stop working. */
export async function revokeUserSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/** userId of the pending login (password verified, code not yet confirmed), or null. */
export async function getLoginChallengeUserId(): Promise<string | null> {
  const store = await cookies();
  return readLoginChallenge(store.get(LOGIN_CHALLENGE_COOKIE)?.value);
}

const maskEmail = (email: string) => {
  const [u, d] = email.split("@");
  return d ? `${u.slice(0, 1)}${"•".repeat(Math.max(1, u.length - 1))}@${d}` : email;
};
const maskPhone = (phone: string) => (phone.length <= 4 ? phone : `•••• ${phone.slice(-4)}`);

/** The channels a pending login may receive its code on (masked for display). */
export async function getLoginChoices(): Promise<{ email: string; phone: string | null } | null> {
  const uid = await getLoginChallengeUserId();
  if (!uid) return null;
  const user = await db.user.findUnique({ where: { id: uid }, select: { email: true, phone: true, phoneVerified: true } });
  if (!user) return null;
  return {
    email: maskEmail(user.email),
    phone: user.phoneVerified && user.phone ? maskPhone(user.phone) : null,
  };
}

export { LOGIN_CHALLENGE_COOKIE };

async function setCookie(payload: Payload) {
  const ttl = "sa" in payload ? SUPERADMIN_SESSION_MS : USER_SESSION_MS;
  // A SuperAdmin cookie remembers which password generation it was made under, so a reset signs the old ones out.
  if ("sa" in payload && payload.se === undefined) {
    const { getSaSecurity } = await import("@/lib/superadmin-security");
    payload = { ...payload, se: (await getSaSecurity()).epoch };
  }
  const store = await cookies();
  store.set(COOKIE, sign(payload, ttl), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl / 1000,
  });
}

// ── Password hashing ──
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// ── Session lifecycle ──
export async function startUserSession(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  await setCookie({ uid: userId, sv: user?.sessionVersion ?? 0 });
}
export async function startDemoSession() {
  await setCookie({ demo: true });
}
export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

// ── SuperAdmin (platform owner) ──
/**
 * Verify SuperAdmin credentials. A password set through "Forgot password" replaces the one in the environment.
 * Returns false if neither is configured.
 */
export async function checkSuperAdmin(email: string, password: string): Promise<boolean> {
  const expectedEmail = env.SUPERADMIN_EMAIL.toLowerCase();
  const emailOk = email.toLowerCase().trim() === expectedEmail;
  const { getSaSecurity } = await import("@/lib/superadmin-security");
  const { hash } = await getSaSecurity();
  let pwOk = false;
  if (hash) {
    pwOk = await bcrypt.compare(password, hash);
  } else {
    const expectedPw = env.SUPERADMIN_PASSWORD;
    if (!expectedPw) return false; // login disabled until a password is set
    // Constant-time password compare.
    const a = Buffer.from(password);
    const b = Buffer.from(expectedPw);
    pwOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return emailOk && pwOk;
}

/** Is this SuperAdmin cookie from before the latest password reset? */
async function saSignedOut(se: number | undefined): Promise<boolean> {
  const { getSaSecurity } = await import("@/lib/superadmin-security");
  return (se ?? 0) !== (await getSaSecurity()).epoch;
}

export async function startSuperAdminSession() {
  await setCookie({ sa: true });
}

/**
 * SuperAdmin enters a church as support. `until` (ms epoch) makes the entry
 * expire on its own; `rid` ties it to its SupportAccess record.
 */
export async function startGhostSession(churchId: string, opts?: { until?: number; rid?: string }) {
  await setCookie({ sa: true, ghost: churchId, until: opts?.until, rid: opts?.rid });
}

/** Leave a church and return to the admin area. */
export async function stopGhostSession() {
  await setCookie({ sa: true });
}

/** Returns the SuperAdmin identity if the current cookie is a SuperAdmin one. */
export async function getSuperAdmin(): Promise<{ email: string; ghost?: string; rid?: string } | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload || !("sa" in payload)) return null;
  if (await saSignedOut(payload.se)) return null;
  return { email: env.SUPERADMIN_EMAIL, ghost: payload.ghost, rid: payload.rid };
}

/** Guard for /admin pages: returns the SuperAdmin or redirects to admin login. */
export async function requireSuperAdmin(): Promise<{ email: string; ghost?: string; rid?: string }> {
  const sa = await getSuperAdmin();
  if (!sa) redirect("/admin/login");
  return sa;
}

/** The paid features this church's plan doesn't include. */
async function lockedFeatures(churchId: string): Promise<string[]> {
  const { getChurchPlan } = await import("@/lib/plan-gate-server");
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const [plan, cfg, church] = await Promise.all([getChurchPlan(churchId), getPlatformConfig(), db.church.findUnique({ where: { id: churchId }, select: { createdAt: true } })]);
  // A new Free church can use Communications (SMS) during its first month.
  const trialSms = plan === "free" && !!church && commsTrial(church.createdAt).active;
  return ALL_FEATURES.filter((f) => !CORE_FEATURES.includes(f) && !(trialSms && f === "sms") && !planHasFeature(plan as PlanId, f, cfg.planTable));
}

/** Current session (null when signed out). Reads a signed cookie and loads the DB user. */
async function _getSession(): Promise<Session | null> {
  const session = await _loadSession();
  // Demo and support sessions see everything; real users get their church's plan.
  if (session && !session.isDemo && !session.impersonating) {
    session.planLocked = await lockedFeatures(session.churchId);
  }
  return session;
}

async function _loadSession(): Promise<Session | null> {
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
      manageSections: [...ALL_MODULES],
      canDelete: true,
    };
  }

  // SuperAdmin impersonating a church → synthesize an Owner session for it.
  // This identity is NOT a row in the church's User table, so it never appears
  // in their team/roles list. The SuperAdmin's email is never exposed here.
  if ("sa" in payload) {
    if (!payload.ghost) return null; // bare superadmin isn't an app session
    if (await saSignedOut(payload.se)) return null; // the password was reset since this entry began
    if (payload.until && payload.until < Date.now()) return null; // timed entry has lapsed
    // The entry must still be live on its SupportAccess record, so ending it takes effect at once.
    if (!payload.rid) return null;
    const access = await db.supportAccess.findFirst({
      where: { id: payload.rid, churchId: payload.ghost, status: "active", until: { gt: new Date() } },
      select: { id: true },
    });
    if (!access) return null;
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
      manageSections: [...ALL_MODULES],
      canDelete: true,
    };
  }

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    include: { church: true, branch: true, customRole: true, budgetDepartment: true },
  });
  if (!user) return null;
  // A password change or reset bumps sessionVersion, which signs out every older cookie.
  if (user.sessionVersion !== payload.sv) return null;

  // A scoped department-budget leader only ever sees their department's budget,
  // expenses and income - regardless of role.
  if (user.budgetDepartmentId) {
    // Scoped to just their department budget (income/expenses live inside it) -
    // never the church-wide Expenses/Accounting tabs.
    const scoped = ["budgets"];
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      customRole: user.customRole?.name ?? "Budget leader",
      sections: scoped,
      manageSections: scoped,
      exactSections: true,
      canDelete: false,
      churchId: user.churchId,
      churchName: user.church.name,
      budgetDepartmentId: user.budgetDepartmentId,
      budgetDepartmentName: user.budgetDepartment?.name ?? null,
      branch: user.branch?.name ?? "All branches",
      branchId: user.branchId,
      avatarName: user.name,
      avatarUrl: user.photoUrl,
      isDemo: user.church.isDemo,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
    };
  }

  // Custom role overrides the built-in role's access + delete permission.
  // Church-level rolePermissions override the hardcoded defaults for built-in roles.
  const churchOverrides = (user.church.rolePermissions as Record<string, string[]> | null) ?? {};
  const sections = user.customRole
    ? user.customRole.sections
    : churchOverrides[user.role] ?? modulesForRole(user.role);
  // Built-in roles manage everything they can see; custom roles manage only the
  // subset explicitly granted (falling back to all sections for legacy roles
  // saved before the View/Manage split existed).
  // An empty Manage list on a role saved with the View/Manage split means VIEW-ONLY. Only roles that
  // pre-date the split (manageSplit = false) keep managing everything they can see.
  const manageSections = user.customRole
    ? (user.customRole.manageSplit ? user.customRole.manageSections : user.customRole.sections)
    : sections;
  const canDelete = user.customRole ? user.customRole.canDelete : true;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    customRole: user.customRole?.name ?? null,
    sections,
    manageSections,
    // Custom roles mean exactly what was ticked - no sibling expansion.
    exactSections: !!user.customRole,
    canDelete,
    churchId: user.churchId,
    churchName: user.church.name,
    branch: user.branch?.name ?? "All branches",
    branchId: user.branchId,
    avatarName: user.name,
    avatarUrl: user.photoUrl,
    isDemo: user.church.isDemo,
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
  };
}
export const getSession = cache(_getSession);

/** Use in app pages/actions: returns the session or redirects to sign-in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Guard for write actions - demo church is read-only. */
export class DemoReadOnlyError extends Error {
  constructor() {
    super("This is the read-only demo. Create a free account to make changes.");
  }
}
/** The locked plan feature a section needs, or null when the church's plan includes it. */
export function planLockFor(session: Session, module: string): string | null {
  const feature = featureForSection(module);
  return feature && session.planLocked?.includes(feature) ? feature : null;
}

export class PlanLockedError extends Error {
  constructor(feature: string) {
    const plan = getMinimumPlan(feature);
    super(`${FEATURE_LABELS[feature] ?? feature} is part of the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan. The Main Admin can upgrade in Settings, Billing.`);
  }
}

export function assertCanWrite(session: Session, module?: string) {
  if (session.isDemo) throw new DemoReadOnlyError();
  if (module) {
    const locked = planLockFor(session, module);
    if (locked) throw new PlanLockedError(locked);
  }
  // Given a section, the person must be allowed to MANAGE it, not just see it.
  if (module && !canManage(session, module)) throw new Error("Your role can view this but not make changes to it.");
}

/** Guard for delete actions - blocked for demo and for roles without delete rights. */
export function assertCanDelete(session: Session) {
  if (session.isDemo) throw new DemoReadOnlyError();
  if (!session.canDelete) throw new Error("Your role doesn't have permission to delete records.");
}

/** Require the session to have access to a module/section, else redirect.
 *  Parent-aware: holding a coarse parent key grants its fine sections. */
export async function requireModule(module: string): Promise<Session> {
  const session = await requireSession();
  if (!hasSection(session, module)) {
    redirect("/app");
  }
  // A section the plan doesn't include goes to the upgrade page, the same as its locked menu item.
  if (planLockFor(session, module)) redirect("/app/settings?tab=billing");
  return session;
}

/** Require the session to be able to manage (add/edit) a section, else redirect. */
export async function requireManage(module: string): Promise<Session> {
  const session = await requireSession();
  if (!canManage(session, module)) {
    redirect("/app");
  }
  if (planLockFor(session, module)) redirect("/app/settings?tab=billing");
  return session;
}

export { COOKIE as SESSION_COOKIE };
