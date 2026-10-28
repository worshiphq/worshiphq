import "server-only";
import { db } from "@/lib/db";
import { describeCurrentService, resolveServiceSession, WEEKDAY_NAMES } from "@/lib/attendance/service-times";
import { categoryForPerson } from "@/lib/data/attendance";
import { getAgeConfig } from "@/lib/data/age";
import { localParts, ymdInTz, zonedToUtc } from "@/lib/time/tz";

export type PunchResult = "checked_in" | "already_in" | "unknown_id" | "too_old" | "outside_hours";
/** A device and the hours it should count scans (see "When should scans count?" on the Devices page). */
type Device = { id: string; churchId: string; scanRule?: string; windowDays?: number[]; windowStart?: string | null; windowEnd?: string | null };

const toMinutes = (hm: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Should a scan at `at` count? Keeps a cleaner, a late-night visitor or a Tuesday walk-through out of attendance.
 *  - "service-times": only during a service (and its grace period). If the church has not set service times, everything counts.
 *  - "custom": only on the chosen days, between the chosen hours (church time).
 *  - "always": every scan counts.
 */
export async function scanAllowed(device: Device, at: Date): Promise<boolean> {
  const rule = device.scanRule ?? "service-times";
  if (rule === "always") return true;
  if (rule === "custom") {
    const church = await db.church.findUnique({ where: { id: device.churchId }, select: { timezone: true } });
    const { weekday, hour, minute } = localParts(at, church?.timezone ?? "Africa/Accra");
    const days = device.windowDays ?? [];
    if (days.length > 0 && !days.includes(weekday)) return false;
    const start = toMinutes(device.windowStart);
    const end = toMinutes(device.windowEnd);
    if (start === null || end === null) return true; // days only
    const now = hour * 60 + minute;
    return start <= end ? now >= start && now <= end : now >= start || now <= end; // an overnight window wraps past midnight
  }
  const current = await describeCurrentService(device.churchId, null, at);
  return current === null || current.slot !== null; // null = service times are off, so nothing to check against
}

/** What the device says it used. ZKTeco verify codes: 1 fingerprint, 15 face, 25 palm (others are cards or passwords). */
export function modeFromVerify(code: string | number | null | undefined): string | null {
  const c = Number(code);
  if (c === 1) return "fingerprint";
  if (c === 15) return "face";
  if (c === 25) return "palm";
  return null;
}

/** The member for a device user ID: the number at the end of their member ID (GBC-0042 is 42), or the whole member ID. */
export async function personForPin(churchId: string, pin: string): Promise<{ id: string; firstName: string; lastName: string; status: string; dateOfBirth: Date | null; birthday: string | null; ageGroup: string | null } | null> {
  const clean = pin.trim();
  if (!clean) return null;
  const select = { id: true, firstName: true, lastName: true, status: true, dateOfBirth: true, birthday: true, ageGroup: true } as const;
  if (!/^\d+$/.test(clean)) {
    return db.person.findFirst({ where: { churchId, memberId: { equals: clean, mode: "insensitive" } }, select }) as never;
  }
  const n = Number(clean);
  const rows = await db.person.findMany({ where: { churchId, memberId: { endsWith: String(n) } }, select: { ...select, memberId: true }, take: 100 });
  const hits = rows.filter((r) => {
    const m = /(\d+)$/.exec(r.memberId ?? "");
    return m && Number(m[1]) === n;
  });
  return hits.length === 1 ? (hits[0] as never) : null; // two members with the same number is ambiguous: do not guess
}

/** The service a scan at `at` belongs to: from the service times, else today's open service, else a new one for the day. */
export async function sessionForDevice(churchId: string, at: Date) {
  const timed = await resolveServiceSession(churchId, null, at);
  if (timed) return timed;
  const church = await db.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  const tz = church?.timezone ?? "Africa/Accra";
  const day = ymdInTz(at, tz);
  const start = zonedToUtc(day, "00:00", tz);
  const end = new Date(start.getTime() + 86400000);
  const open = await db.attendanceSession.findFirst({ where: { churchId, endedAt: null, date: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } });
  if (open) return open;
  const autoKey = `${churchId}:device:${day}`;
  const have = await db.attendanceSession.findFirst({ where: { autoKey }, orderBy: { createdAt: "asc" } });
  if (have) return have;
  const created = await db.attendanceSession.create({ data: { churchId, serviceName: `${WEEKDAY_NAMES[localParts(at, tz).weekday]} Service`, date: at, autoKey } });
  const first = await db.attendanceSession.findFirst({ where: { autoKey }, orderBy: { createdAt: "asc" } });
  if (first && first.id !== created.id) {
    await db.attendanceSession.deleteMany({ where: { id: created.id, records: { none: {} } } });
    return first;
  }
  return created;
}

/** One scan from a device: find the member, put them into the right service, and keep a note of what happened. */
export async function recordPunch(device: Device, input: { pin: string; at: Date; mode?: string | null }): Promise<{ result: PunchResult; name: string | null }> {
  const now = new Date();
  let at = input.at;
  if (at.getTime() > now.getTime() + 10 * 60000) at = now; // a clock that runs fast
  const pin = input.pin.slice(0, 40);
  const log = (result: PunchResult, name: string | null) =>
    db.biometricDeviceEvent.create({ data: { deviceId: device.id, churchId: device.churchId, pin, at, mode: input.mode ?? null, result, personName: name } }).catch(() => {});
  // Someone who keeps walking past would fill the list: note a repeat (or an off-hours pass) once per half hour.
  const logOnce = async (result: PunchResult, name: string | null) => {
    const recent = await db.biometricDeviceEvent.findFirst({ where: { deviceId: device.id, pin, result, createdAt: { gt: new Date(now.getTime() - 30 * 60000) } }, select: { id: true } });
    if (!recent) await log(result, name);
  };

  if (now.getTime() - at.getTime() > 36 * 3600000) { await log("too_old", null); return { result: "too_old", name: null }; }

  if (!(await scanAllowed(device, at))) { await logOnce("outside_hours", null); return { result: "outside_hours", name: null }; }

  const person = await personForPin(device.churchId, input.pin);
  if (!person) { await log("unknown_id", null); return { result: "unknown_id", name: null }; }
  const name = `${person.firstName} ${person.lastName}`.trim();

  const sess = await sessionForDevice(device.churchId, at);
  const dup = await db.attendanceRecord.findFirst({ where: { sessionId: sess.id, personId: person.id }, select: { id: true } });
  if (dup) { await logOnce("already_in", name); await db.biometricDevice.update({ where: { id: device.id }, data: { lastScanAt: now } }); return { result: "already_in", name }; }

  const category = categoryForPerson(
    { status: person.status, dateOfBirth: person.dateOfBirth, birthday: person.birthday, ageGroup: person.ageGroup },
    await getAgeConfig(device.churchId),
  );
  const field: Record<string, string> = { adult: "adults", teen: "teens", child: "children", visitor: "visitors" };
  await db.attendanceRecord.create({
    data: { churchId: device.churchId, branchId: sess.branchId ?? undefined, personId: person.id, sessionId: sess.id, category, serviceName: sess.serviceName, date: at, method: "biometric",
      // How the device recognised them (face / palm / fingerprint), so a profile can show it long after the scan log is cleared.
      verifiedBy: `device-${input.mode ?? "scan"}` },
  });
  await db.attendanceSession.update({ where: { id: sess.id }, data: { [field[category] ?? "adults"]: { increment: 1 } } });
  if (person.status === "visitor") {
    const { recordVisitorCheckin } = await import("@/lib/visitor-checkin");
    await recordVisitorCheckin(person.id, device.churchId).catch(() => {});
  }
  await log("checked_in", name);
  await db.biometricDevice.update({ where: { id: device.id }, data: { lastScanAt: now } });
  return { result: "checked_in", name };
}

/** A device's clock reading ("2026-10-14 08:03:12") is the church's local time. */
export function parseDeviceTime(text: string, timeZone: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(text.trim());
  if (!m) return null;
  const d = zonedToUtc(m[1], `${m[2]}:${m[3]}`, timeZone);
  return isNaN(d.getTime()) ? null : d;
}

/** Only churches on a plan with check-in devices (face, palm and fingerprint terminals) take scans. */
export async function deviceChurchAllowed(churchId: string): Promise<boolean> {
  const { getChurchPlan } = await import("@/lib/plan-gate-server");
  const { planHasFeature } = await import("@/lib/plan-gate");
  return planHasFeature(await getChurchPlan(churchId), "biometric-devices");
}
