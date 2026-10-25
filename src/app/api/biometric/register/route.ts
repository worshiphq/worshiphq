import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManage, hasSection } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** The number a check-in device knows a member by: the digits at the end of their member ID (GBC-0042 is 42). */
function devicePin(memberId: string | null): string | null {
  const m = /(\d+)$/.exec(memberId ?? "");
  return m ? String(Number(m[1])) : null;
}

/**
 * A member's check-in identity: the fingerprints saved from the USB scanner (one row per finger), and how
 * they check in on the church's face / palm / fingerprint devices. Device templates live on the device
 * itself, so that side is worked out from what the devices have reported.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSection(session, "attendance") && !hasSection(session, "people")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const personId = req.nextUrl.searchParams.get("personId");
  if (!personId) return NextResponse.json({ fingers: [], credentials: [] });

  const person = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { id: true, memberId: true } });
  if (!person) return NextResponse.json({ fingers: [], credentials: [] });

  const creds = await db.biometricCredential.findMany({
    where: { personId: person.id, churchId: session.churchId, type: "scanner" },
    select: { id: true, finger: true, registeredAt: true, deviceName: true },
    orderBy: { registeredAt: "asc" },
  });
  const fingers = [...new Set(creds.map((c) => c.finger).filter((f): f is string => !!f))];

  // ── Check-in devices ──
  const devices = await db.biometricDevice.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true } });
  const pin = devicePin(person.memberId);
  let device: {
    pin: string | null;
    hasDevices: boolean;
    modes: string[];
    last: { at: string; mode: string | null; deviceName: string | null } | null;
    sentTo: string[];
  } = { pin, hasDevices: devices.length > 0, modes: [], last: null, sentTo: [] };

  if (devices.length && pin) {
    const deviceIds = devices.map((d) => d.id);
    const [events, records, commands] = await Promise.all([
      // Recent scans (devices keep 30 days of these), matched by the device user number.
      db.biometricDeviceEvent.findMany({
        where: { churchId: session.churchId, pin, result: { in: ["checked_in", "already_in"] } },
        orderBy: { at: "desc" }, take: 20,
        select: { at: true, mode: true, device: { select: { name: true } } },
      }),
      // Every device check-in on record (kept for good).
      db.attendanceRecord.findMany({
        where: { churchId: session.churchId, personId: person.id, verifiedBy: { startsWith: "device-" } },
        orderBy: { date: "desc" }, take: 20,
        select: { date: true, verifiedBy: true },
      }),
      // Devices this member's details were sent to.
      db.biometricDeviceCommand.findMany({
        where: { deviceId: { in: deviceIds }, body: { contains: `USERINFO PIN=${pin}\t` } },
        select: { deviceId: true },
        distinct: ["deviceId"],
      }),
    ]);
    const modes = new Set<string>();
    for (const e of events) if (e.mode) modes.add(e.mode);
    for (const r of records) {
      const m = (r.verifiedBy ?? "").replace(/^device-/, "");
      if (m && m !== "scan") modes.add(m);
    }
    const lastEvent = events[0];
    const lastRecord = records[0];
    const last = lastEvent
      ? { at: lastEvent.at.toISOString(), mode: lastEvent.mode, deviceName: lastEvent.device.name }
      : lastRecord
        ? { at: lastRecord.date.toISOString(), mode: (lastRecord.verifiedBy ?? "").replace(/^device-/, "").replace(/^scan$/, "") || null, deviceName: null }
        : null;
    const names = new Map(devices.map((d) => [d.id, d.name]));
    device = { ...device, modes: [...modes], last, sentTo: commands.map((c) => names.get(c.deviceId) ?? "a device") };
  }

  return NextResponse.json({
    fingers,
    count: creds.length,
    credentials: creds.map((c) => ({ id: c.id, finger: c.finger, registeredAt: c.registeredAt.toISOString() })),
    device,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session, "attendance") || session.planLocked?.includes("fingerprint")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { personId, templateData, quality, format, deviceName, finger } = await req.json();
  if (!personId || !templateData) {
    return NextResponse.json({ error: "personId and templateData required" }, { status: 400 });
  }

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true },
  });
  if (!person) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const fingerId = typeof finger === "string" && finger.trim() ? finger.trim() : null;

  // Re-registering the same finger replaces the old template for it.
  if (fingerId) {
    await db.biometricCredential.deleteMany({
      where: { personId: person.id, churchId: session.churchId, type: "scanner", finger: fingerId },
    });
  }

  await db.biometricCredential.create({
    data: {
      personId: person.id,
      churchId: session.churchId,
      type: "scanner",
      templateData,
      finger: fingerId,
      quality: quality ?? 0,
      format: format ?? "raw",
      deviceName: deviceName || "USB Scanner",
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Remove one saved fingerprint (by its id), for example a finger registered on the wrong person.
 * Allowed on any plan: a church can always remove biometric data it no longer wants.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session, "attendance")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const personId = req.nextUrl.searchParams.get("personId") ?? "";
  const credentialId = req.nextUrl.searchParams.get("credentialId") ?? "";
  if (!personId || !credentialId) return NextResponse.json({ error: "personId and credentialId required" }, { status: 400 });

  const cred = await db.biometricCredential.findFirst({
    where: { id: credentialId, personId, churchId: session.churchId, type: "scanner" },
    select: { id: true, finger: true, person: { select: { firstName: true, lastName: true } } },
  });
  if (!cred) return NextResponse.json({ error: "Fingerprint not found" }, { status: 404 });

  await db.biometricCredential.deleteMany({ where: { id: cred.id, churchId: session.churchId } });
  const who = `${cred.person.firstName} ${cred.person.lastName}`.trim();
  await audit(session, "delete", "fingerprint", `Removed ${cred.finger ? cred.finger.replace("_", " ") : "a"} fingerprint from ${who}`, personId).catch(() => {});

  return NextResponse.json({ ok: true });
}
