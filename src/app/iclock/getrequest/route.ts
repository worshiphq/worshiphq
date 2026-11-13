import { deviceBySerial, text, touch } from "@/lib/devices/zk";
import { deviceChurchAllowed } from "@/lib/devices/punch";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The device asks whether there is anything for it to do. */
export async function GET(req: Request) {
  const device = await deviceBySerial(req);
  // A switched-off device, or a church whose plan no longer has devices, gets nothing: the queued commands carry
  // member names and PINs, and anyone who knows the serial on the label can call this address.
  if (!device || !device.enabled || !(await deviceChurchAllowed(device.churchId))) return text("OK");
  await touch(device.id);
  const todo = await db.biometricDeviceCommand.findMany({ where: { deviceId: device.id, sentAt: null }, orderBy: { id: "asc" }, take: 30 });
  if (todo.length === 0) return text("OK");
  await db.biometricDeviceCommand.updateMany({ where: { id: { in: todo.map((c) => c.id) } }, data: { sentAt: new Date() } });
  return text(todo.map((c) => `C:${c.id}:${c.body}`).join("\n"));
}
