import { NextResponse } from "next/server";
import { isTester, latestRelease, newer } from "@/lib/live-release";

/**
 * WorshipHQ Live automatic updates (the Tauri updater asks here).
 * GET /api/media/update?target=windows&arch=x86_64&current=1.0.0
 * → 204 when the app is up to date, or { version, notes, pub_date, url, signature } for a newer version.
 * Versions are published in SuperAdmin › Live versions.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const none = () => new NextResponse(null, { status: 204 });
  if ((q.get("target") ?? "windows") !== "windows" || (q.get("arch") ?? "x86_64") !== "x86_64") return none();
  try {
    const r = await latestRelease(await isTester(req));
    if (!r || !newer(r.version, q.get("current") ?? "0.0.0")) return none();
    const published = r.log.filter((l) => l.what.startsWith("Published")).pop()?.at ?? r.uploadedAt;
    return NextResponse.json(
      { version: r.version, notes: r.notes, pub_date: published, url: `${new URL(req.url).origin}/api/media/update/file?v=${encodeURIComponent(r.version)}`, signature: r.signature },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[media/update]", e);
    return none();
  }
}
