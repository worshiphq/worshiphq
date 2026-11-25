import { NextResponse } from "next/server";
import { signedGetUrl } from "@/lib/storage";
import { latestRelease } from "@/lib/live-release";

/** Download the newest WorshipHQ Live installer published to everyone (SuperAdmin › Live versions). */
export async function GET() {
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  if (!(await getPlatformConfig()).promotions.launch.on) {
    return new NextResponse("WorshipHQ Live isn't available to download yet. It launches soon.", { status: 404 });
  }
  const r = await latestRelease(false).catch(() => null);
  if (!r) return new NextResponse("WorshipHQ Live isn't available to download yet. Please try again later.", { status: 404 });
  return NextResponse.redirect(await signedGetUrl(r.key, 3600), { headers: { "Cache-Control": "no-store" } });
}
