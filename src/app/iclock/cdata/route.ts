import { deviceBySerial, handleAttLog, settingsFor, text, touch } from "@/lib/devices/zk";
import { parseOptions, parseTemplateLines } from "@/lib/devices/protocol";
import { handleTemplateUpload, onDeviceHello, recordReported } from "@/lib/devices/sync";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The device says hello and asks for its settings. */
export async function GET(req: Request) {
  const device = await deviceBySerial(req);
  if (!device) return text("OK"); // not one of ours: say nothing useful
  const q = new URL(req.url).searchParams;
  await touch(device.id, [q.get("DeviceType"), q.get("pushver")].filter(Boolean).join(" "));
  // Ask it to report its versions, and on its very first contact send it every member and registration.
  if (device.enabled) await onDeviceHello(device);
  // Keep each device's note of recent scans short.
  await db.biometricDeviceEvent.deleteMany({ where: { deviceId: device.id, createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } }).catch(() => {});
  return text(settingsFor(device.serial));
}

/** The device sends its scans, new registrations (face, palm, fingerprint) and its own settings. */
export async function POST(req: Request) {
  const device = await deviceBySerial(req);
  if (!device || !device.enabled) return text("OK");
  await touch(device.id);
  const table = (new URL(req.url).searchParams.get("table") ?? "").toUpperCase();
  if (table === "ATTLOG") {
    const body = await req.text();
    const n = await handleAttLog(device, body);
    return text(`OK:${n}`);
  }
  if (table === "OPERLOG" || table === "BIODATA") {
    const body = await req.text();
    await handleTemplateUpload(device, parseTemplateLines(body, table));
    return text(`OK:${body.split(/\r?\n/).filter((l) => l.trim()).length}`);
  }
  if (table === "OPTIONS") {
    await recordReported(device, parseOptions(await req.text()));
    return text("OK");
  }
  return text("OK"); // photos and the like are not needed
}
