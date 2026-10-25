import "server-only";
import { db } from "@/lib/db";
import { signToken, readToken } from "@/lib/auth/tokens";

/**
 * Tokens for the desktop app. They are signed under their own purpose, so a desktop token is never
 * accepted as a web session and a web cookie is never accepted here. Every request re-checks that the
 * user still exists in that church, is not signed out (sessionVersion) and the church is not suspended.
 */
const DESKTOP_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

export type DesktopAuth = { uid: string; cid: string; role: string };

export function signDesktopToken(userId: string, churchId: string, sessionVersion: number): string {
  return signToken("desktop", { uid: userId, cid: churchId, sv: sessionVersion }, DESKTOP_TOKEN_MS);
}

/** Signed plan details the desktop app keeps offline (so it can't fake a plan on its own). */
export function signPlanStamp(data: { cid: string; plan: string; renewsAt: string | null; status: string }): string {
  return signToken("desktop-plan", { ...data, ts: Date.now() }, 45 * 24 * 60 * 60 * 1000);
}

export async function verifyDesktopToken(authHeader: string | null): Promise<DesktopAuth | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const data = readToken<{ uid?: unknown; cid?: unknown; sv?: unknown }>("desktop", authHeader.slice(7).trim());
  if (!data || typeof data.uid !== "string" || typeof data.cid !== "string") return null;
  const user = await db.user.findFirst({
    where: { id: data.uid, churchId: data.cid },
    select: { role: true, sessionVersion: true, church: { select: { suspended: true } } },
  });
  if (!user || user.church.suspended) return null;
  if (user.sessionVersion !== (typeof data.sv === "number" ? data.sv : -1)) return null;
  return { uid: data.uid, cid: data.cid, role: user.role };
}
