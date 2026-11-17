import { deviceBySerial, text, touch } from "@/lib/devices/zk";
import { parseTemplateLines } from "@/lib/devices/protocol";
import { handleTemplateUpload } from "@/lib/devices/sync";

export const dynamic = "force-dynamic";

/**
 * Newer firmware answers a DATA QUERY (registrations already on the device) here, in the same line format as an
 * upload: POST /iclock/querydata?SN=...&type=tabledata&tablename=biodata&cmdid=...&count=...
 */
export async function POST(req: Request) {
  const device = await deviceBySerial(req);
  if (!device || !device.enabled) return text("OK");
  await touch(device.id);
  const q = new URL(req.url).searchParams;
  const table = (q.get("tablename") ?? q.get("table") ?? "").toUpperCase();
  const body = await req.text();
  const n = await handleTemplateUpload(device, parseTemplateLines(body, table === "BIODATA" ? "BIODATA" : table));
  return text(`${table.toLowerCase() || "data"}=${n}`);
}
