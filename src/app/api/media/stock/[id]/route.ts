import { NextResponse } from "next/server";
import { signedGetUrl } from "@/lib/storage";
import { STOCK_CORS, STOCK_PREFIX, readStock, stockAccess } from "@/lib/media-stock";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: STOCK_CORS });
}

/** A short-lived download link for one background (the file comes straight from storage). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await stockAccess(req))) {
    return NextResponse.json({ error: "Free backgrounds come with a WorshipHQ Live licence." }, { status: 401, headers: STOCK_CORS });
  }
  const item = (await readStock()).items.find((i) => i.id === id && !i.hidden);
  if (!item) return NextResponse.json({ error: "That background isn't available any more." }, { status: 404, headers: STOCK_CORS });
  return NextResponse.json(
    { url: await signedGetUrl(STOCK_PREFIX + item.file, 3600), bytes: item.bytes, kind: item.kind, ext: item.file.split(".").pop() },
    { headers: { ...STOCK_CORS, "Cache-Control": "no-store" } },
  );
}
