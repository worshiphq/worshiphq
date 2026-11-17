/**
 * The pure part of member locking: no database, no server-only imports, so it can be tested on its own and its
 * wording used in client components. The database side lives in src/lib/member-lock.ts.
 *
 * The rule: when a church has more people than its plan includes, the people who count towards the limit are put
 * in the order they joined (joinedAt, then id, oldest first). The first `limit` stay active and the rest, the
 * newest, are locked. Nothing is stored: renewing or upgrading unlocks everyone at once, and removing people frees
 * places for the next in line. Visitors are never locked, even on Free where they count towards the limit: a
 * visitor at the door is always welcomed.
 */

export type LockRow = { id: string; status: string; joinedAt: Date | string };

/** Oldest first: joinedAt, then id so two people who joined at the same moment always come out the same way. */
export function compareForLock(a: LockRow, b: LockRow): number {
  const ta = new Date(a.joinedAt).getTime();
  const tb = new Date(b.joinedAt).getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The ids that are locked, from every counted person (in any order) and the plan's limit. */
export function pickLockedIds(rows: LockRow[], limit: number | null): string[] {
  if (limit === null || rows.length <= limit) return [];
  return lockedFromTail([...rows].sort(compareForLock).slice(limit));
}

/** The people past the limit, already in order, minus visitors. */
export function lockedFromTail(tail: { id: string; status: string }[]): string[] {
  return tail.filter((r) => r.status !== "visitor").map((r) => r.id);
}

/**
 * The lock for a church, given its limit and how many people count. Only when the church is over its limit is
 * `loadTail` called (with how many to skip): a church within its plan costs nothing beyond the count it already did.
 */
export async function computeLockedIds(input: {
  limit: number | null;
  used: number;
  loadTail: (skip: number) => Promise<{ id: string; status: string }[]>;
}): Promise<string[]> {
  const { limit, used } = input;
  if (limit === null || used <= limit) return [];
  return lockedFromTail(await input.loadTail(limit));
}

// ── Wording, shared by every screen and action ──

export const LOCKED_BADGE = "Locked";
export const LOCKED_LINE = "Over your plan's limit. Renew or upgrade to unlock.";
/** Shown to staff at the door (QR, by-name, devices, marking attendance). */
export const LOCKED_DOOR = "This member's place is locked on the church's current plan. Ask an admin to renew or upgrade to unlock it.";
/** Shown to the member themselves on the public QR check-in page: no plan talk, just where to go. */
export const LOCKED_SELF = "We can't check you in on this page right now. Please speak to an usher.";
export const LOCKED_EDIT = "This person is locked because your church is over its plan's member limit. Renew or upgrade to edit them, or remove people you no longer need.";
export const LOCKED_ADD = "Locked people can't be added here until your church renews or upgrades its plan.";

export function lockedBannerText(locked: number, limit: number): string {
  const n = locked.toLocaleString("en-US");
  return `${n} ${locked === 1 ? "member is" : "members are"} locked because your plan includes ${limit.toLocaleString("en-US")}. Renew or upgrade to unlock them, or remove people you no longer need.`;
}
