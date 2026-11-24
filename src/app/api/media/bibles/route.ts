import { NextResponse } from "next/server";
import { MEDIA_CORS, getMediaEntitlement, verifyMediaToken } from "@/lib/media-license";
import { biblesForChurch } from "@/lib/media-bibles";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: MEDIA_CORS });

/** The Bibles this signed-in church may download in WorshipHQ Live. */
export async function GET(req: Request) {
  const auth = await verifyMediaToken(req.headers.get("authorization"));
  if (!auth) return json({ error: "Please sign in again.", code: "signed_out" }, 401);
  const ent = await getMediaEntitlement(auth.cid);
  if (!ent.active) return json({ bibles: [], note: "Your church needs WorshipHQ Live to download Bibles." });
  return json({ bibles: await biblesForChurch(auth.cid) });
}
