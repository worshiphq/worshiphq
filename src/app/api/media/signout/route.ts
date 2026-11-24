import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_CORS, verifyMediaToken } from "@/lib/media-license";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

/** Signing out frees this computer's seat for another computer. */
export async function POST(req: Request) {
  const auth = await verifyMediaToken(req.headers.get("authorization"));
  if (auth) await db.mediaDevice.deleteMany({ where: { churchId: auth.cid, deviceId: auth.did } });
  return NextResponse.json({ ok: true }, { headers: MEDIA_CORS });
}
