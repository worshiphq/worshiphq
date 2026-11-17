import "server-only";
import { db } from "@/lib/db";

/** The staff day a moment falls on. Ghana is UTC all year, so the UTC calendar day is the local day. */
export const staffDay = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

/** Late after this local time (HH:MM). */
const LATE_AFTER = "08:30";

/**
 * Record a staff clock-in or clock-out. The first punch of the day is the clock-in, any later one moves the clock-out.
 * Returns null when the person is not current staff (nothing happens).
 */
export async function recordStaffPunch(churchId: string, personId: string, at: Date, deviceId: string | null, source: "device" | "self" = "device") {
  const staff = await db.staffMember.findFirst({ where: { churchId, personId, status: "active" }, select: { id: true } });
  if (!staff) return null;
  return punchStaff(churchId, staff.id, at, deviceId, source);
}

export async function punchStaff(churchId: string, staffId: string, at: Date, deviceId: string | null, source: "device" | "self" | "manual") {
  const date = staffDay(at);
  const existing = await db.staffAttendance.findUnique({ where: { staffId_date: { staffId, date } } });
  const late = at.toISOString().slice(11, 16) > LATE_AFTER;
  if (!existing) {
    return db.staffAttendance.create({ data: { churchId, staffId, date, clockIn: at, status: late ? "late" : "present", source, deviceId } }).catch(async () =>
      // Two punches at once: the other one made the row, so treat this as a later punch.
      db.staffAttendance.update({ where: { staffId_date: { staffId, date } }, data: { clockOut: at } }),
    );
  }
  if (existing.clockIn && at.getTime() - existing.clockIn.getTime() < 2 * 60_000) return existing; // a double scan
  if (!existing.clockIn || at < existing.clockIn) return db.staffAttendance.update({ where: { id: existing.id }, data: { clockIn: at } });
  return db.staffAttendance.update({ where: { id: existing.id }, data: { clockOut: at, ...(existing.status === "absent" ? { status: "present" } : {}) } });
}
