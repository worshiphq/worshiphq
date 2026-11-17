"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { hasSection } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getBaseUrl } from "@/lib/url";
import { deviceChurchAllowed } from "@/lib/devices/punch";
import { asReported, enqueue, fullSyncDevice, resyncAllDevices, templatesReceivedByDevice } from "@/lib/devices/sync";
import { BIO, deviceTakesUsbFingerprints, majorFor, queryBioCommand, supportsBiodata, type Reported } from "@/lib/devices/protocol";

export type DeviceRow = {
  id: string; name: string; brand: "zkteco" | "webhook"; modes: string[]; serial: string; secret: string | null; enabled: boolean;
  online: boolean; lastSeenAt: string | null; lastScanAt: string | null; info: string | null; pending: number;
  scanRule: "service-times" | "custom" | "always"; windowDays: number[]; windowStart: string | null; windowEnd: string | null;
  /** Sync status: what the device last reported about itself, and what WorshipHQ has received from it. */
  sync: {
    users: number | null; fingers: number | null; faces: number | null; lastSyncAt: string | null; templatesReceived: number; failed: number;
    /** "Fingerprint 10, Face 7" as reported; empty when the device has not said. */
    versions: string[];
    /** Takes USB-scanner fingerprints (fingerprint version 10). */
    usbShared: boolean;
  };
};
export type DeviceEventRow = { id: string; device: string; at: string; mode: string | null; result: string; name: string | null; pin: string };
export type DevicesData = {
  devices: DeviceRow[]; events: DeviceEventRow[]; host: string; baseUrl: string; canManage: boolean; planOk: boolean;
  /** Whether the church has set up service times (the scan-hours rule "during service times" needs them). */
  serviceTimesOn: boolean;
  /** "Keep devices in sync automatically" (members and registrations). */
  autoSync: boolean;
};

const MODES = ["fingerprint", "face", "palm"];

function syncInfo(r: Reported, syncedAt: Date | null, templatesReceived: number, failed: number): DeviceRow["sync"] {
  const versions: string[] = [];
  const fp = majorFor(r, BIO.finger);
  if (fp) versions.push(`Fingerprint ${fp}`);
  const face = majorFor(r, BIO.face) ?? majorFor(r, BIO.vlFace);
  if (face) versions.push(`Face ${face}`);
  const palm = majorFor(r, BIO.palm) ?? majorFor(r, BIO.palmPrint);
  if (palm) versions.push(`Palm ${palm}`);
  return {
    users: r.users ?? null, fingers: r.fingers ?? null, faces: r.faces ?? null, lastSyncAt: syncedAt?.toISOString() ?? null,
    templatesReceived, failed, versions, usbShared: deviceTakesUsbFingerprints(r),
  };
}
const clean = (v: unknown, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function guard(session: Awaited<ReturnType<typeof requireSession>>) {
  assertCanWrite(session, "attendance");
  if (session.isDemo) throw new Error("Read-only demo.");
}

export async function getDevices(): Promise<DevicesData> {
  const session = await requireSession();
  // Serials are the devices' only credential, and the scan log has member names and PINs.
  if (!hasSection(session, "attendance")) throw new Error("Your role cannot see the check-in devices.");
  const [devices, events, baseUrl, planOk, church, received] = await Promise.all([
    db.biometricDevice.findMany({ where: { churchId: session.churchId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { commands: { where: { sentAt: null } } } } } }),
    db.biometricDeviceEvent.findMany({ where: { churchId: session.churchId }, orderBy: { createdAt: "desc" }, take: 25, include: { device: { select: { name: true } } } }),
    getBaseUrl(),
    deviceChurchAllowed(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { serviceTimesOn: true, deviceAutoSync: true } }),
    templatesReceivedByDevice(session.churchId),
  ]);
  // Commands a device answered with an error code, in the last week.
  const failedRows = devices.length
    ? await db.biometricDeviceCommand.groupBy({
      by: ["deviceId"], where: { deviceId: { in: devices.map((d) => d.id) }, result: { lt: 0 }, doneAt: { gt: new Date(Date.now() - 7 * 86400000) } }, _count: { _all: true },
    })
    : [];
  const failed = new Map(failedRows.map((r) => [r.deviceId, r._count._all]));
  const admin = session.role === "Owner" || session.role === "Admin";
  const soon = Date.now() - 6 * 60000; // devices check in about every 2 minutes
  return {
    devices: devices.map((d) => ({
      id: d.id, name: d.name, brand: d.brand === "webhook" ? "webhook" : "zkteco", modes: d.modes, serial: d.brand === "webhook" ? "" : d.serial,
      secret: d.brand === "webhook" && admin ? d.secret : null, enabled: d.enabled,
      online: !!d.lastSeenAt && d.lastSeenAt.getTime() > soon, lastSeenAt: d.lastSeenAt?.toISOString() ?? null, lastScanAt: d.lastScanAt?.toISOString() ?? null,
      info: d.info, pending: d._count.commands,
      scanRule: d.scanRule === "custom" || d.scanRule === "always" ? d.scanRule : "service-times", windowDays: d.windowDays, windowStart: d.windowStart, windowEnd: d.windowEnd,
      sync: syncInfo(asReported(d.reported), d.syncedAt, received.get(d.id) ?? 0, failed.get(d.id) ?? 0),
    })),
    events: events.map((e) => ({ id: e.id, device: e.device.name, at: e.at.toISOString(), mode: e.mode, result: e.result, name: e.personName, pin: e.pin })),
    host: new URL(baseUrl).host, baseUrl, canManage: !session.isDemo, planOk, serviceTimesOn: !!church?.serviceTimesOn,
    autoSync: church?.deviceAutoSync ?? true,
  };
}

export async function addDevice(input: { name: string; brand: "zkteco" | "webhook"; serial?: string; modes: string[] }) {
  const session = await requireSession();
  guard(session);
  if (!(await deviceChurchAllowed(session.churchId))) return { ok: false as const, error: "Check-in devices (face, palm and fingerprint terminals) are part of the Max plan." };
  const name = clean(input.name, 60);
  if (!name) return { ok: false as const, error: "Give the device a name, like Main door." };
  const modes = (input.modes ?? []).filter((m) => MODES.includes(m));
  let serial: string;
  if (input.brand === "webhook") {
    serial = `wh_${crypto.randomBytes(8).toString("hex")}`;
  } else {
    serial = clean(input.serial, 40).toUpperCase().replace(/\s/g, "");
    if (serial.length < 4) return { ok: false as const, error: "Enter the serial number from the label on the device (the SN)." };
    const taken = await db.biometricDevice.findUnique({ where: { serial }, select: { churchId: true } });
    if (taken) return { ok: false as const, error: taken.churchId === session.churchId ? "That device is already added." : "That serial number is already linked to another church. Contact support." };
  }
  const d = await db.biometricDevice.create({
    data: { churchId: session.churchId, name, brand: input.brand === "webhook" ? "webhook" : "zkteco", modes: modes.length ? modes : ["fingerprint"], serial, secret: crypto.randomBytes(24).toString("hex") },
  });
  await audit(session, "create", "settings", `Added the biometric device ${name}`);
  revalidatePath("/app/devices");
  return { ok: true as const, id: d.id };
}

export async function updateDevice(id: string, input: { name?: string; modes?: string[]; enabled?: boolean; scanRule?: string; windowDays?: number[]; windowStart?: string | null; windowEnd?: string | null }) {
  const session = await requireSession();
  guard(session);
  const cur = await db.biometricDevice.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!cur) return { ok: false as const, error: "Not found." };
  const hm = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (input.scanRule !== undefined && !["service-times", "custom", "always"].includes(input.scanRule)) return { ok: false as const, error: "Choose when scans should count." };
  if (input.scanRule === "custom" && (!input.windowStart || !input.windowEnd || !hm.test(input.windowStart) || !hm.test(input.windowEnd))) return { ok: false as const, error: "Enter a start and end time, like 06:00 and 13:00." };
  await db.biometricDevice.update({
    where: { id },
    data: {
      ...(input.scanRule !== undefined ? { scanRule: input.scanRule } : {}),
      ...(input.windowDays ? { windowDays: [...new Set(input.windowDays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() } : {}),
      ...(input.windowStart !== undefined ? { windowStart: input.windowStart && hm.test(input.windowStart) ? input.windowStart : null } : {}),
      ...(input.windowEnd !== undefined ? { windowEnd: input.windowEnd && hm.test(input.windowEnd) ? input.windowEnd : null } : {}),
      ...(input.name !== undefined && clean(input.name, 60) ? { name: clean(input.name, 60) } : {}),
      ...(input.modes ? { modes: input.modes.filter((m) => MODES.includes(m)) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  revalidatePath("/app/devices");
  return { ok: true as const };
}

export async function deleteDevice(id: string) {
  const session = await requireSession();
  guard(session);
  const cur = await db.biometricDevice.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  if (!cur) return { ok: false as const, error: "Not found." };
  await db.biometricDevice.delete({ where: { id } });
  await audit(session, "delete", "settings", `Removed the biometric device ${cur.name}`);
  revalidatePath("/app/devices");
  return { ok: true as const };
}

/** Every member (and every registration the device can read) queued for a terminal: a full resend. */
export async function sendMembersToDevice(id: string) {
  const session = await requireSession();
  guard(session);
  const device = await db.biometricDevice.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, brand: true } });
  if (!device) return { ok: false as const, error: "Not found." };
  if (device.brand !== "zkteco") return { ok: false as const, error: "This only applies to terminals that connect to WorshipHQ themselves." };
  // People locked by the plan's member limit are not sent: their scans would not check them in anyway.
  const r = await fullSyncDevice(id);
  revalidatePath("/app/devices");
  return { ok: true as const, queued: r.queued, skipped: r.skipped, templates: r.templates };
}

/** "Keep devices in sync automatically". Turning it on catches every device up straight away. */
export async function setDeviceAutoSync(on: boolean) {
  const session = await requireSession();
  guard(session);
  if (session.role !== "Owner" && session.role !== "Admin") return { ok: false as const, error: "Only an Owner or Admin can change this." };
  await db.church.update({ where: { id: session.churchId }, data: { deviceAutoSync: !!on } });
  await audit(session, "update", "settings", on ? "Turned on automatic device sync" : "Turned off automatic device sync");
  if (on) await resyncAllDevices(session.churchId);
  revalidatePath("/app/devices");
  return { ok: true as const };
}

/** Ask a terminal to upload the face, palm and fingerprint registrations it already holds, so they can be copied. */
export async function fetchRegistrationsFromDevice(id: string) {
  const session = await requireSession();
  guard(session);
  const device = await db.biometricDevice.findFirst({ where: { id, churchId: session.churchId, brand: "zkteco" }, select: { id: true, modes: true, reported: true } });
  if (!device) return { ok: false as const, error: "Not found." };
  const rep = asReported(device.reported);
  const types = new Set<number>();
  if (device.modes.includes("fingerprint")) types.add(BIO.finger);
  if (device.modes.includes("face")) types.add(supportsBiodata(rep) && majorFor(rep, BIO.vlFace) ? BIO.vlFace : BIO.face);
  if (device.modes.includes("palm")) types.add(BIO.palm);
  await enqueue(id, [...types].map(queryBioCommand));
  revalidatePath("/app/devices");
  return { ok: true as const };
}
