import { deviceBySerial, handleAttLog, settingsFor, text, touch } from "@/lib/devices/zk";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The device says hello and asks for its settings. */
export async function GET(req: Request) {
  const device = await deviceBySerial(req);
  if (!device) return text("OK"); // not one of ours: say nothing useful
  const q = new URL(req.url).searchParams;
  await touch(device.id, [q.get("DeviceType"), q.get("pushver")].filter(Boolean).join(" "));
  // Keep each device's note of recent scans short.
  await db.biometricDeviceEvent.deleteMany({ where: { deviceId: device.id, createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } }).catch(() => {});
  return text(settingsFor(device.serial));
}

/** The device sends its scans. */
export async function POST(req: Request) {
  const device = await deviceBySerial(req);
  if (!device || !device.enabled) return text("OK");
  await touch(device.id);
  const table = new URL(req.url).searchParams.get("table");
  if (table === "ATTLOG") {
    const body = await req.text();
    const n = await handleAttLog(device, body);
    return text(`OK:${n}`);
  }
  return text("OK"); // user lists, photos and the like are not needed
}
