import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { MEDIA_CORS, getMediaEntitlement, verifyMediaToken } from "@/lib/media-license";
import { canDownload } from "@/lib/media-bibles";

export const maxDuration = 60;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

/** Download one Bible file (only for a signed-in church it is published to). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyMediaToken(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: MEDIA_CORS });
  const ent = await getMediaEntitlement(auth.cid);
  if (!ent.active) return NextResponse.json({ error: "Your church needs WorshipHQ Live to download Bibles." }, { status: 403, headers: MEDIA_CORS });
  const bible = await canDownload(id, auth.cid);
  if (!bible) return NextResponse.json({ error: "That Bible isn't available to your church." }, { status: 404, headers: MEDIA_CORS });

  const file = await getObject(bible.objectKey);
  await db.mediaBible.update({ where: { id }, data: { downloads: { increment: 1 } } }).catch(() => {});
  return new Response(new Uint8Array(file), {
    headers: {
      ...MEDIA_CORS,
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Bible-Format": bible.format,
      "X-Bible-Abbreviation": bible.abbreviation,
      "Access-Control-Expose-Headers": "X-Bible-Format, X-Bible-Abbreviation",
    },
  });
}
