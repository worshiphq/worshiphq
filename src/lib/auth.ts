import "server-only";
import { cookies } from "next/headers";
import { type Session, can, ROLE_PERMISSIONS } from "@/lib/permissions";

/**
 * Lightweight cookie-based session for stub mode. The shape mirrors what Auth.js
 * (NextAuth) would provide, so swapping in real auth later is a drop-in change:
 * replace getSession() with auth() and keep the same Session type downstream.
 */
export type { Session };
export { can, ROLE_PERMISSIONS };

const COOKIE = "whq_session";

/** Demo accounts — any password works in stub mode. */
export const demoUsers: (Session & { password: string })[] = [
  { name: "Pastor Daniel", email: "pastor@grace.org", password: "demo", role: "Owner", branch: "Accra Central", avatarName: "Daniel Mensah" },
  { name: "Abena (Admin)", email: "admin@grace.org", password: "demo", role: "Admin", branch: "Accra Central", avatarName: "Abena Osei" },
  { name: "Kwabena (Finance)", email: "finance@grace.org", password: "demo", role: "Finance", branch: "East Legon", avatarName: "Kwabena Owusu" },
];

const DEFAULT_SESSION: Session = {
  name: "Pastor Daniel",
  email: "pastor@grace.org",
  role: "Owner",
  branch: "Accra Central",
  avatarName: "Daniel Mensah",
};

/** Returns the current session. In stub mode, falls back to a demo Owner so the
    app is always explorable without signing in. */
export async function getSession(): Promise<Session> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return DEFAULT_SESSION;
  try {
    return { ...DEFAULT_SESSION, ...JSON.parse(raw) } as Session;
  } catch {
    return DEFAULT_SESSION;
  }
}

export { COOKIE as SESSION_COOKIE };
