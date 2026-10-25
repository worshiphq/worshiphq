import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * Counts attempts at an action under a key (for example "otp:dest:233241234567") and refuses once
 * `max` have happened within `windowMs`. Every allowed attempt is recorded. Rows older than the
 * window for that key are pruned as we go, so the table stays small.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const recent = await db.rateHit.count({ where: { key, createdAt: { gt: since } } });
  if (recent >= max) return false;
  await db.rateHit.create({ data: { key } });
  if (Math.random() < 0.05) {
    await db.rateHit.deleteMany({ where: { key, createdAt: { lt: since } } }).catch(() => {});
  }
  return true;
}

/** Several limits at once (all must pass). Stops at the first one that is used up. */
export async function rateLimitAll(rules: { key: string; max: number; windowMs: number }[]): Promise<boolean> {
  for (const r of rules) {
    if (!(await rateLimit(r.key, r.max, r.windowMs))) return false;
  }
  return true;
}

/** The caller's IP address as Vercel reports it (first hop of x-forwarded-for). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  } catch {
    return "unknown";
  }
}

export function ipFromRequest(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
