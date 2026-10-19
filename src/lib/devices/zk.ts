import "server-only";
import { db } from "@/lib/db";
import { deviceChurchAllowed, modeFromVerify, parseDeviceTime, recordPunch } from "@/lib/devices/punch";

/**
 * The ZKTeco "cloud server" (ADMS / push) protocol, which most face, palm and fingerprint terminals
 * speak: the device calls these three addresses on its own, so nothing is installed on a computer.
 *   GET  /iclock/cdata       the device says hello and asks for its settings
 *   POST /iclock/cdata       the device sends its scans (table=ATTLOG)
 *   GET  /iclock/getrequest  the device asks if there is anything to do (members to add)
 *   POST /iclock/devicecmd   the device reports that it did it
 */

export const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });

export async function deviceBySerial(request: Request) {
  const sn = new URL(request.url).searchParams.get("SN")?.trim().toUpperCase();
  if (!sn) return null;
  const device = await db.biometricDevice.findUnique({ where: { serial: sn } });
  if (!device || device.brand !== "zkteco") return null;
  return device;
}

/** Note that the device called in, and keep what it says it is. */
export async function touch(deviceId: string, info?: string | null) {
  await db.biometricDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date(), ...(info ? { info: info.slice(0, 160) } : {}) } }).catch(() => {});
}

/** The settings we send back when a device says hello. */
export function settingsFor(sn: string) {
  return [
    `GET OPTION FROM: ${sn}`,
    "ErrorDelay=60",
    // How often the device asks "anything for me?" (seconds). Scans are pushed the moment they happen (Realtime=1),
    // so this only affects how fast "send members to device" arrives. Every 10 seconds would cost about 260,000
    // function calls a month per device; every 2 minutes costs about 21,000.
    "Delay=120",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData AttLog\tOpLog",
    "Realtime=1",
    "Encrypt=0",
  ].join("\n");
}

/** Read the scans a device posted: tab-separated lines of user ID, time, status, verify type. */
export async function handleAttLog(device: Parameters<typeof recordPunch>[0], body: string) {
  if (!(await deviceChurchAllowed(device.churchId))) return 0;
  const church = await db.church.findUnique({ where: { id: device.churchId }, select: { timezone: true } });
  const tz = church?.timezone ?? "Africa/Accra";
  let n = 0;
  for (const line of body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500)) {
    const cols = line.split("\t");
    const pin = (cols[0] ?? "").replace(/^PIN=/i, "");
    const at = parseDeviceTime(cols[1] ?? "", tz);
    if (!pin || !at) continue;
    await recordPunch(device, { pin, at, mode: modeFromVerify(cols[3]) });
    n++;
  }
  return n;
}
