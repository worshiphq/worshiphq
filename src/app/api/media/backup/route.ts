import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getObject, putObject } from "@/lib/storage";
import { STOCK_CORS, stockAccess } from "@/lib/media-stock";

export const maxDuration = 30;

/**
 * WorshipHQ Live cloud backup: the app's songs, schedules, looks and settings, kept under the church's backup code
 * so they can be restored on any computer. Stored privately (the object name is a hash of the code).
 */
const keyFor = (code: string) => `media-backups/${createHash("sha256").update(`whq-backup:${code}`).digest("hex")}.json`;
const CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...STOCK_CORS, "Access-Control-Allow-Methods": "GET, PUT, OPTIONS" } });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...STOCK_CORS, "Access-Control-Allow-Methods": "GET, PUT, OPTIONS", "Cache-Control": "no-store" } });

export async function PUT(req: Request) {
  if (!(await stockAccess(req))) return json({ error: "Cloud backup comes with a WorshipHQ Live licence." }, 401);
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!CODE.test(code)) return json({ error: "Bad backup code." }, 400);
  const text = await req.text();
  if (text.length > 15_000_000) return json({ error: "The backup is too big (over 15 MB)." }, 413);
  try {
    const file = JSON.parse(text);
    if ((file?.app !== "WorshipHQ Live" && file?.app !== "WorshipHQ Media") || file?.kind !== "backup") return json({ error: "Not a WorshipHQ Live backup." }, 400);
  } catch {
    return json({ error: "Not a WorshipHQ Live backup." }, 400);
  }
  await putObject(keyFor(code), Buffer.from(text), "application/json");
  return json({ ok: true, at: new Date().toISOString() });
}

export async function GET(req: Request) {
  if (!(await stockAccess(req))) return json({ error: "Cloud backup comes with a WorshipHQ Live licence." }, 401);
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!CODE.test(code)) return json({ error: "Bad backup code." }, 400);
  try {
    const buf = await getObject(keyFor(code));
    return new NextResponse(new Uint8Array(buf), { headers: { ...STOCK_CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return json({ error: "No backup found for that code." }, 404);
  }
}
