import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Account lockouts. Five wrong tries in a row (a wrong password, or a wrong sign-in code) lock that account for 24 hours.
 * Built on the same RateHit table as the other limits, so it needs no new table:
 *   fail:<key>   one row per wrong try
 *   lock:<key>   one row when the account was locked; it lasts 24 hours from that moment
 * A right answer clears the wrong tries. Resetting the password, or an unlock from the SuperAdmin, clears the lock.
 */

export const LOCK_AFTER = 5;
export const LOCK_HOURS = 24;
const LOCK_MS = LOCK_HOURS * 60 * 60 * 1000;

/** Where a locked-out person is told to write. No phone number, on purpose. */
export const supportEmail = () => (env.SUPPORT_EMAIL ?? "").trim() || env.SUPERADMIN_EMAIL;

export async function lockStatus(key: string): Promise<{ locked: boolean; until?: Date }> {
  const lock = await db.rateHit.findFirst({
    where: { key: `lock:${key}`, createdAt: { gt: new Date(Date.now() - LOCK_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return lock ? { locked: true, until: new Date(lock.createdAt.getTime() + LOCK_MS) } : { locked: false };
}

/** Count a wrong try. Returns whether this one locked the account, and how many tries are left before it does. */
export async function recordFailure(key: string): Promise<{ locked: boolean; remaining: number }> {
  await db.rateHit.create({ data: { key: `fail:${key}` } });
  const fails = await db.rateHit.count({ where: { key: `fail:${key}`, createdAt: { gt: new Date(Date.now() - LOCK_MS) } } });
  if (fails >= LOCK_AFTER) {
    await db.rateHit.create({ data: { key: `lock:${key}` } });
    await db.rateHit.deleteMany({ where: { key: `fail:${key}` } });
    return { locked: true, remaining: 0 };
  }
  return { locked: false, remaining: LOCK_AFTER - fails };
}

/** A right answer: forget the wrong tries. */
export async function clearFailures(key: string): Promise<void> {
  await db.rateHit.deleteMany({ where: { key: `fail:${key}` } }).catch(() => {});
}

/** Lift a lock and forget the wrong tries (after a password reset, or by the SuperAdmin). */
export async function clearLock(key: string): Promise<void> {
  await db.rateHit.deleteMany({ where: { key: { in: [`lock:${key}`, `fail:${key}`] } } }).catch(() => {});
}

// ── The keys, built one way everywhere so a lock set in one place is found in another ──
export const passwordKey = (identifier: string) => `pw:${identifier.trim().toLowerCase().replace(/\s+/g, "")}`;
/** The account itself, so trying its email, then its phone number, never earns more tries. */
export const userPasswordKey = (userId: string) => `pw:u:${userId}`;
export const codeKey = (userId: string) => `code:${userId}`;
export const saPasswordKey = (email: string) => `sapw:${email.trim().toLowerCase()}`;
export const saCodeKey = (who: string) => `sacode:${who.trim().toLowerCase()}`;
