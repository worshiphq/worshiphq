import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceChurchAllowed, parseDeviceTime, recordPunch } from "@/lib/devices/punch";

export const dynamic = "force-dynamic";

const MODES = ["fingerprint", "face", "palm"];

/**
 * For any device, gate controller or piece of software that can send a web request.
 * POST { "id": "42" or "GBC-0042", "time": "2026-10-14 08:03:12" (optional), "method": "face" (optional) }
 * or { "events": [ ... ] }, with the device's token as "Authorization: Bearer <token>".
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : req.headers.get("x-device-token") ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 401 });
  const device = await db.biometricDevice.findFirst({ where: { secret: token, brand: "webhook" } });
  if (!device || !device.enabled) return NextResponse.json({ ok: false, error: "Unknown or switched-off device." }, { status: 401 });
  if (!(await deviceChurchAllowed(device.churchId))) return NextResponse.json({ ok: false, error: "This church's plan does not include biometric check-in." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Send JSON." }, { status: 400 }); }
  const list = Array.isArray((body as { events?: unknown })?.events) ? (body as { events: unknown[] }).events : [body];
  const church = await db.church.findUnique({ where: { id: device.churchId }, select: { timezone: true } });
  const tz = church?.timezone ?? "Africa/Accra";
  await db.biometricDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  const results: { id: string; result: string; name: string | null }[] = [];
  for (const raw of list.slice(0, 200)) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const id = String(e.id ?? e.pin ?? e.memberId ?? "").trim();
    if (!id) continue;
    let at = new Date();
    if (typeof e.time === "string" && e.time) {
      const iso = new Date(e.time);
      at = /[zZ]|[+-]\d{2}:?\d{2}$/.test(e.time) && !isNaN(iso.getTime()) ? iso : parseDeviceTime(e.time, tz) ?? at;
    }
    const m = String(e.method ?? "").toLowerCase();
    const r = await recordPunch(device, { pin: id, at, mode: MODES.includes(m) ? m : null });
    results.push({ id, result: r.result, name: r.name });
  }
  return NextResponse.json({ ok: true, results });
}
