import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { type Session, can, ROLE_PERMISSIONS } from "@/lib/permissions";

export type { Session };
export { can, ROLE_PERMISSIONS };

const COOKIE = "whq_session";
const SECRET = env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";

// ── Signed-cookie helpers (HMAC so the payload can't be tampered) ──
type Payload = { uid: string } | { demo: true };

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
    };
  }

  const user = await db.user.findUnique({ where: { id: payload.uid }, include: { church: true, branch: true } });
  if (!user) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    churchId: user.churchId,
    churchName: user.church.name,
    branch: user.branch?.name ?? "All branches",
    branchId: user.branchId,
    avatarName: user.name,
    isDemo: user.church.isDemo,
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

export { COOKIE as SESSION_COOKIE };
