import { NextResponse } from "next/server";
import { getObject, signedGetUrl } from "@/lib/storage";

/** Download the newest WorshipHQ Live installer (the one published with scripts/publish-media-release.mjs). */
export async function GET() {
  try {
    const r = JSON.parse((await getObject("media-releases/latest.json")).toString("utf8")) as { platforms: Record<string, { key: string }> };
    const file = r.platforms["windows-x86_64"];
    if (!file) throw new Error("no windows build");
    return NextResponse.redirect(await signedGetUrl(file.key, 3600), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("WorshipHQ Live isn't available to download yet. Please try again later.", { status: 404 });
  }
}
