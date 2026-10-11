import "server-only";
import { db } from "@/lib/db";
import { localParts, ymdInTz } from "@/lib/time/tz";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Slot = { id: string; name: string; weekday: number; startMinute: number; endMinute: number; branchId: string | null };

/**
 * Which of the day's services a moment belongs to.
 *  1. Inside a service's window -> that service (the later-starting one if two overlap).
 *  2. Otherwise the nearest service within `grace` minutes: an early arrival
 *     joins the next service, a late one the service that just ended.
 *  3. Otherwise none (the caller uses a general service for the day).
 */
export function pickSlot(slots: Slot[], minute: number, grace: number): Slot | null {
  const inside = slots
    .filter((s) => minute >= s.startMinute && minute < s.endMinute)
    .sort((a, b) => b.startMinute - a.startMinute);
  if (inside[0]) return inside[0];

  let best: { slot: Slot; distance: number; upcoming: boolean } | null = null;
  for (const s of slots) {
    const upcoming = s.startMinute > minute;
    const distance = upcoming ? s.startMinute - minute : minute - s.endMinute;
    if (distance < 0 || distance > grace) continue;
    if (!best || distance < best.distance || (distance === best.distance && upcoming && !best.upcoming)) {
      best = { slot: s, distance, upcoming };
    }
  }
  return best?.slot ?? null;
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const formatMinute = fmt;

/** The church's service times, when switched on. Null when off (callers keep the old behaviour). */
async function scheduleFor(churchId: string) {
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { serviceTimesOn: true, serviceGraceMinutes: true, timezone: true },
  });
  if (!church?.serviceTimesOn) return null;
  return church;
}

/** What service a check-in at `now` would go to, without creating anything (for previews). */
export async function describeCurrentService(churchId: string, branchId: string | null, now = new Date()) {
  const church = await scheduleFor(churchId);
  if (!church) return null;
  const { weekday, hour, minute } = localParts(now, church.timezone);
  const slots = await db.serviceSlot.findMany({
    where: { churchId, active: true, weekday, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
  });
  const slot = pickSlot(slots, hour * 60 + minute, church.serviceGraceMinutes);
  return { slot, name: slot?.name ?? `${WEEKDAY_NAMES[weekday]} Service`, weekday };
}

/**
 * The attendance session a check-in at `now` belongs to, opened if needed.
 * Returns null when the church has not switched service times on.
 */
export async function resolveServiceSession(churchId: string, branchId: string | null, now = new Date()) {
  const church = await scheduleFor(churchId);
  if (!church) return null;
  const { weekday, hour, minute } = localParts(now, church.timezone);
  const day = ymdInTz(now, church.timezone);
  const slots = await db.serviceSlot.findMany({
    where: { churchId, active: true, weekday, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
  });
  const slot = pickSlot(slots, hour * 60 + minute, church.serviceGraceMinutes);
  const autoKey = `${churchId}:${branchId ?? "all"}:${day}:${slot?.id ?? "general"}`;

  const existing = await db.attendanceSession.findFirst({ where: { autoKey }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  const created = await db.attendanceSession.create({
    data: {
      churchId,
      branchId: branchId ?? undefined,
      serviceName: slot?.name ?? `${WEEKDAY_NAMES[weekday]} Service`,
      date: now,
      slotId: slot?.id ?? null,
      autoKey,
    },
  });

  // Two devices may open the same service at the same instant; keep the oldest
  // and drop ours if it lost the race (it has no check-ins yet).
  const first = await db.attendanceSession.findFirst({ where: { autoKey }, orderBy: { createdAt: "asc" } });
  if (first && first.id !== created.id) {
    await db.attendanceSession.deleteMany({ where: { id: created.id, records: { none: {} } } });
    return first;
  }
  return created;
}

/**
 * For kiosk-style check-ins (self QR, fingerprint): if the target session was
 * opened from the service times, send the check-in to whichever service is on
 * now instead. Sessions started by hand are left alone.
 */
export async function routeAutoSession<T extends { id: string; churchId: string; branchId: string | null; autoKey: string | null }>(sess: T, now = new Date()) {
  if (!sess.autoKey) return sess;
  const current = await resolveServiceSession(sess.churchId, sess.branchId, now);
  return current ?? sess;
}

