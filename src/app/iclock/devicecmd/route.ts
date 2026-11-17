import { deviceBySerial, text } from "@/lib/devices/zk";
import { parseOptions } from "@/lib/devices/protocol";
import { recordReported } from "@/lib/devices/sync";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The device reports back on what we asked it to do: one "ID=12&Return=0&CMD=DATA" per command. Its answer to
 * INFO also carries its settings (FPVersion=10, FaceVersion=7 ...), which are kept for copying registrations.
 */
export async function POST(req: Request) {
  const device = await deviceBySerial(req);
  if (!device) return text("OK");
  const body = await req.text();
  const results = new Map<number, number | null>();
  for (const m of body.matchAll(/(?:^|[&\n])ID=(\d+)(?:&Return=(-?\d+))?/g)) {
    if (results.size >= 100) break;
    results.set(Number(m[1]), m[2] !== undefined ? Number(m[2]) : null);
  }
  const ids = [...results.keys()];
  if (ids.length) {
    const now = new Date();
    await db.biometricDeviceCommand.updateMany({ where: { deviceId: device.id, id: { in: ids } }, data: { doneAt: now } });
    // Keep the device's answer code (0 = done, below 0 = it could not), one write per code.
    const byCode = new Map<number, number[]>();
    for (const [id, code] of results) if (code !== null) byCode.set(code, [...(byCode.get(code) ?? []), id]);
    for (const [code, list] of byCode) await db.biometricDeviceCommand.updateMany({ where: { deviceId: device.id, id: { in: list } }, data: { result: code } }).catch(() => {});
    await db.biometricDevice.update({ where: { id: device.id }, data: { syncedAt: now } }).catch(() => {});
  }
  if (/CMD=INFO/i.test(body) || /FPVersion|FaceVersion|MultiBio/i.test(body)) await recordReported(device, parseOptions(body));
  return text("OK");
}
