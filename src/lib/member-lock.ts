import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ttlCached, ttlInvalidate } from "@/lib/ttl-cache";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { countedPeopleWhere } from "@/lib/member-limit";
import { computeLockedIds, LOCKED_ADD, LOCKED_DOOR, LOCKED_EDIT } from "@/lib/member-lock-core";

/**
 * People beyond the plan's member limit are locked until the church renews, upgrades or removes people.
 * See src/lib/member-lock-core.ts for the rule. Nothing is stored, so a plan change takes effect within the cache
 * time below on every server instance, and straight away on the one that made the change.
 *
 * Locked people stay in People, the directory and exports, can be deleted, and can still have giving recorded.
 * They are left out of messages and automations, check-in of every kind, and being added to rosters, groups,
 * departments, follow-ups and pledges.
 */
export type MemberLock = { limit: number | null; used: number; locked: Set<string> };

const TTL_MS = 60_000;
const key = (churchId: string) => `member-lock:${churchId}`;
const NONE: ReadonlySet<string> = new Set();

async function loadLock(churchId: string): Promise<MemberLock> {
  const plan = await getChurchPlan(churchId);
  const where = countedPeopleWhere(churchId, plan);
  const [cfg, used] = await Promise.all([getPlatformConfig(), db.person.count({ where })]);
  const raw = cfg.planTable[plan]?.members;
  const limit = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
  const ids = await computeLockedIds({
    limit,
    used,
    loadTail: (skip) =>
      db.person.findMany({ where, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], skip, select: { id: true, status: true } }),
  });
  return { limit, used, locked: new Set(ids) };
}

/** The church's lock: its limit, how many people count, and who is locked. Cached for a minute per church. */
export function getMemberLock(churchId: string): Promise<MemberLock> {
  return ttlCached(key(churchId), TTL_MS, () => loadLock(churchId));
}

/** Forget the cached lock after people are added or removed, or the plan changes. */
export function invalidateMemberLock(churchId: string): void {
  ttlInvalidate(key(churchId));
  ttlInvalidate(`over-limit:${churchId}`);
}

export async function lockedPersonIds(churchId: string): Promise<ReadonlySet<string>> {
  const lock = await getMemberLock(churchId);
  return lock.locked.size ? lock.locked : NONE;
}

export async function isPersonLocked(churchId: string, personId: string | null | undefined): Promise<boolean> {
  if (!personId) return false;
  return (await lockedPersonIds(churchId)).has(personId);
}

/** The ids from `ids` that are locked. */
export async function lockedAmong(churchId: string, ids: Iterable<string | null | undefined>): Promise<string[]> {
  const locked = await lockedPersonIds(churchId);
  if (!locked.size) return [];
  return [...new Set([...ids].filter((id): id is string => !!id && locked.has(id)))];
}

/** A Person where-fragment that leaves locked people out. `{}` when nobody is locked. */
export async function notLockedWhere(churchId: string): Promise<Prisma.PersonWhereInput> {
  const locked = await lockedPersonIds(churchId);
  return locked.size ? { id: { notIn: [...locked] } } : {};
}

/** Every person in the church who is not locked, as a Person where clause. */
export async function activePeopleWhere(churchId: string): Promise<Prisma.PersonWhereInput> {
  return { churchId, ...(await notLockedWhere(churchId)) };
}

/** `rows` without the locked people. Rows with no person id (typed-in numbers, the Visitors list) always stay. */
export async function dropLocked<T>(churchId: string, rows: T[], idOf: (row: T) => string | null | undefined): Promise<T[]> {
  if (!rows.length) return rows;
  const locked = await lockedPersonIds(churchId);
  if (!locked.size) return rows;
  return rows.filter((r) => {
    const id = idOf(r);
    return !id || !locked.has(id);
  });
}

/** Null when the person may be edited, otherwise the message to show. */
export async function lockedEditError(churchId: string, personId: string): Promise<string | null> {
  return (await isPersonLocked(churchId, personId)) ? LOCKED_EDIT : null;
}

/** Null when the person may check in, otherwise the friendly message for staff at the door. */
export async function lockedDoorError(churchId: string, personId: string | null | undefined): Promise<string | null> {
  return (await isPersonLocked(churchId, personId)) ? LOCKED_DOOR : null;
}

/** Null when none of `ids` is locked, otherwise the message to show when adding them somewhere. */
export async function lockedAddError(churchId: string, ids: Iterable<string | null | undefined>): Promise<string | null> {
  return (await lockedAmong(churchId, ids)).length ? LOCKED_ADD : null;
}
