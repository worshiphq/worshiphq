import { deviceBySerial, text, touch } from "@/lib/devices/zk";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The device asks whether there is anything for it to do. */
export async function GET(req: Request) {
  const device = await deviceBySerial(req);
  if (!device) return text("OK");
  await touch(device.id);
  const todo = await db.biometricDeviceCommand.findMany({ where: { deviceId: device.id, sentAt: null }, orderBy: { id: "asc" }, take: 30 });
  if (todo.length === 0) return text("OK");
  await db.biometricDeviceCommand.updateMany({ where: { id: { in: todo.map((c) => c.id) } }, data: { sentAt: new Date() } });
  return text(todo.map((c) => `C:${c.id}:${c.body}`).join("\n"));
}
