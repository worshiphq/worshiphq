import { NextResponse } from "next/server";
import { STOCK_CORS, stockAccess } from "@/lib/media-stock";
import { listProfiles, readProfile, validId } from "@/lib/live-profiles";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: STOCK_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...STOCK_CORS, "Cache-Control": "no-store" } });

/** Template profiles a church can start from: the list, or one of them (?id=). */
export async function GET(req: Request) {
  if (!(await stockAccess(req))) return json({ error: "Sign in to WorshipHQ Live first." }, 401);
  const id = new URL(req.url).searchParams.get("id");
  try {
    const list = (await listProfiles()).filter((p) => !p.hidden);
    if (!id) return json({ profiles: list });
    if (!validId(id) || !list.some((p) => p.id === id)) return json({ error: "That template is no longer shared." }, 404);
    return json({ profile: await readProfile(id) });
  } catch (e) {
    console.error("[media/profiles]", e);
    return json({ error: "The templates couldn't be read. Try again." }, 502);
  }
}
