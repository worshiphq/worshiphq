import { deviceBySerial, text } from "@/lib/devices/zk";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The device reports back on what we asked it to do. */
export async function POST(req: Request) {
  const device = await deviceBySerial(req);
  if (!device) return text("OK");
  const body = await req.text();
  const ids = [...body.matchAll(/(?:^|[&\n])ID=(\d+)/g)].map((m) => Number(m[1])).slice(0, 100);
  if (ids.length) await db.biometricDeviceCommand.updateMany({ where: { deviceId: device.id, id: { in: ids } }, data: { doneAt: new Date() } });
  return text("OK");
}
