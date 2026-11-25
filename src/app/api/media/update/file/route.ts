import { NextResponse } from "next/server";
import { signedGetUrl } from "@/lib/storage";
import { isTester, listReleases } from "@/lib/live-release";

/**
 * The update file. The app downloads from here, and is passed on to the storage link. The app sends its sign-in with
 * every update request, and the storage server refuses a request that has one, so the app is sent on from our own
 * address (an app drops its sign-in when it is passed to another address).
 */
export async function GET(req: Request) {
  const version = new URL(req.url).searchParams.get("v") ?? "";
  try {
    const r = (await listReleases()).find((x) => x.version === version && x.status === "published");
    if (!r || (r.audience === "testers" && !(await isTester(req)))) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(await signedGetUrl(r.key, 6 * 3600), { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[media/update/file]", e);
    return new NextResponse(null, { status: 502 });
  }
}
