"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getBaseUrl } from "@/lib/url";
import { deviceChurchAllowed } from "@/lib/devices/punch";

export type DeviceRow = {
  id: string; name: string; brand: "zkteco" | "webhook"; modes: string[]; serial: string; secret: string | null; enabled: boolean;
  online: boolean; lastSeenAt: string | null; lastScanAt: string | null; info: string | null; pending: number;
  scanRule: "service-times" | "custom" | "always"; windowDays: number[]; windowStart: string | null; windowEnd: string | null;
};
export type DeviceEventRow = { id: string; device: string; at: string; mode: string | null; result: string; name: string | null; pin: string };
export type DevicesData = {
  devices: DeviceRow[]; events: DeviceEventRow[]; host: string; baseUrl: string; canManage: boolean; planOk: boolean;
  /** Whether the church has set up service times (the scan-hours rule "during service times" needs them). */
  serviceTimesOn: boolean;
};

const MODES = ["fingerprint", "face", "palm"];
const clean = (v: unknown, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function guard(session: Awaited<ReturnType<typeof requireSession>>) {
  assertCanWrite(session, "attendance");
  if (session.isDemo) throw new Error("Read-only demo.");
}

export async function getDevices(): Promise<DevicesData> {
  const session = await requireSession();
  const [devices, events, baseUrl, planOk, church] = await Promise.all([
    db.biometricDevice.findMany({ where: { churchId: session.churchId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { commands: { where: { sentAt: null } } } } } }),
    db.biometricDeviceEvent.findMany({ where: { churchId: session.churchId }, orderBy: { createdAt: "desc" }, take: 25, include: { device: { select: { name: true } } } }),
    getBaseUrl(),
    deviceChurchAllowed(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { serviceTimesOn: true } }),
  ]);
  const admin = session.role === "Owner" || session.role === "Admin";
  const soon = Date.now() - 6 * 60000; // devices check in about every 2 minutes
  return {
    devices: devices.map((d) => ({
      id: d.id, name: d.name, brand: d.brand === "webhook" ? "webhook" : "zkteco", modes: d.modes, serial: d.brand === "webhook" ? "" : d.serial,
      secret: d.brand === "webhook" && admin ? d.secret : null, enabled: d.enabled,
      online: !!d.lastSeenAt && d.lastSeenAt.getTime() > soon, lastSeenAt: d.lastSeenAt?.toISOString() ?? null, lastScanAt: d.lastScanAt?.toISOString() ?? null,
      info: d.info, pending: d._count.commands,
      scanRule: d.scanRule === "custom" || d.scanRule === "always" ? d.scanRule : "service-times", windowDays: d.windowDays, windowStart: d.windowStart, windowEnd: d.windowEnd,
    })),
    events: events.map((e) => ({ id: e.id, device: e.device.name, at: e.at.toISOString(), mode: e.mode, result: e.result, name: e.personName, pin: e.pin })),
    host: new URL(baseUrl).host, baseUrl, canManage: !session.isDemo, planOk, serviceTimesOn: !!church?.serviceTimesOn,
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

/** Plain letters only: many terminals cannot show anything else on a name. */
const asciiName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);

/** Queue every member to be added to a terminal, by name, so staff only have to enrol the face, palm or finger. */
export async function sendMembersToDevice(id: string) {
  const session = await requireSession();
  guard(session);
  const device = await db.biometricDevice.findFirst({ where: { id, churchId: session.churchId } });
  if (!device) return { ok: false as const, error: "Not found." };
  if (device.brand !== "zkteco") return { ok: false as const, error: "This only applies to terminals that connect to WorshipHQ themselves." };
  const people = await db.person.findMany({ where: { churchId: session.churchId, status: "active", memberId: { not: null } }, select: { firstName: true, lastName: true, memberId: true }, take: 3000, orderBy: { memberId: "asc" } });
  const seen = new Map<number, number>();
  const rows: { pin: number; name: string }[] = [];
  for (const p of people) {
    const m = /(\d+)$/.exec(p.memberId ?? "");
    if (!m) continue;
    const pin = Number(m[1]);
    seen.set(pin, (seen.get(pin) ?? 0) + 1);
    rows.push({ pin, name: asciiName(`${p.firstName} ${p.lastName}`) || String(pin) });
  }
  const unique = rows.filter((r) => seen.get(r.pin) === 1);
  await db.biometricDeviceCommand.deleteMany({ where: { deviceId: id, sentAt: null } });
  await db.biometricDeviceCommand.createMany({
    data: unique.map((r) => ({ deviceId: id, body: `DATA UPDATE USERINFO PIN=${r.pin}\tName=${r.name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=` })),
  });
  revalidatePath("/app/devices");
  return { ok: true as const, queued: unique.length, skipped: rows.length - unique.length };
}
