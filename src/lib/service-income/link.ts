// Linking giving to a service. Giving is recorded once, in Giving; a service record (ServiceIncome) is only a header
// that the gifts point at, so Service income can show what each service brought in next to how many came.
import "server-only";
import { db } from "@/lib/db";
import { ownedId } from "@/lib/tenant";
import { zonedToUtc } from "@/lib/time/tz";
import { churchTzFor } from "@/lib/data/service-income";
import { shiftYmd, weekdayOf } from "@/lib/service-income/types";
import { cleanServiceName, mergeServiceChoices, serviceKey, type ServiceChoice, type ServicePick } from "@/lib/service-income/choose";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function dayRange(churchId: string, ymd: string) {
  const tz = await churchTzFor(churchId);
  return { tz, from: zonedToUtc(ymd, "00:00", tz), to: zonedToUtc(shiftYmd(ymd, 1), "00:00", tz) };
}

/** The services a gift on this local day can be linked to. */
export async function serviceChoicesOn(churchId: string, ymd: string): Promise<ServiceChoice[]> {
  if (!YMD.test(ymd)) return [];
  const { from, to } = await dayRange(churchId, ymd);
  const [slots, records, sessions] = await Promise.all([
    db.serviceSlot.findMany({ where: { churchId, active: true, weekday: weekdayOf(ymd) }, select: { id: true, name: true, startMinute: true } }),
    db.serviceIncome.findMany({ where: { churchId, date: { gte: from, lt: to } }, orderBy: { createdAt: "asc" }, select: { id: true, serviceName: true, slotId: true, sessionId: true } }),
    db.attendanceSession.findMany({ where: { churchId, date: { gte: from, lt: to } }, orderBy: { date: "asc" }, select: { id: true, serviceName: true } }),
  ]);
  return mergeServiceChoices({ slots, records, sessions });
}

/**
 * The service record for (church, local day, service name), made if there is none yet. Race-safe without a schema
 * change: the create runs under a transaction-scoped advisory lock on that key, and looks again once it holds it, so
 * two treasurers saving the same service at once still get one record.
 */
export async function findOrCreateServiceIncome(
  churchId: string,
  ymd: string,
  pick: ServicePick,
  by: { userId?: string | null; name?: string | null },
): Promise<string | null> {
  const name = cleanServiceName(pick?.name);
  if (!name || !YMD.test(ymd)) return null;
  const { tz, from, to } = await dayRange(churchId, ymd);
  const where = { churchId, serviceName: { equals: name, mode: "insensitive" as const }, date: { gte: from, lt: to } };
  const hit = await db.serviceIncome.findFirst({ where, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (hit) return hit.id;

  // Ids from the browser are only used when they are this church's.
  const [slotId, sentSession] = await Promise.all([
    ownedId("serviceSlot", pick.slotId ?? null, churchId),
    ownedId("attendanceSession", pick.sessionId ?? null, churchId),
  ]);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`service-income:${churchId}:${ymd}:${serviceKey(name)}`}))`;
    const again = await tx.serviceIncome.findFirst({ where, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (again) return again.id;
    // Attendance taken at the same service that day gives the headcount.
    const sessionId = sentSession
      ?? (await tx.attendanceSession.findFirst({ where: { churchId, serviceName: { equals: name, mode: "insensitive" }, date: { gte: from, lt: to } }, select: { id: true } }))?.id
      ?? null;
    const row = await tx.serviceIncome.create({
      data: { churchId, date: zonedToUtc(ymd, "12:00", tz), serviceName: name, slotId, sessionId, createdById: by.userId ?? null, createdByName: by.name ?? null },
      select: { id: true },
    });
    return row.id;
  });
}

/** Read a service pick sent by the browser (or a FormData form). Null when not linked. */
export function readServicePick(raw: unknown): ServicePick | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = cleanServiceName(r.name);
  if (!name) return null;
  const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 64 ? v : null);
  return { name, slotId: id(r.slotId), sessionId: id(r.sessionId) };
}
