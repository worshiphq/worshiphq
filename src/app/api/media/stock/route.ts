import { NextResponse } from "next/server";
import { STOCK_CORS, stockAccess, stockList } from "@/lib/media-stock";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: STOCK_CORS });
}

/** WorshipHQ stock backgrounds for WorshipHQ Live (licensed computers / churches with Media). */
export async function GET(req: Request) {
  if (!(await stockAccess(req))) {
    return NextResponse.json({ error: "Free backgrounds come with a WorshipHQ Live licence.", code: "no_access" }, { status: 401, headers: STOCK_CORS });
  }
  return NextResponse.json({ items: await stockList() }, { headers: { ...STOCK_CORS, "Cache-Control": "no-store" } });
}
