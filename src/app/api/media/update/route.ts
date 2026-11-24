import { NextResponse } from "next/server";
import { getObject, signedGetUrl } from "@/lib/storage";

/**
 * WorshipHQ Live automatic updates (the Tauri updater asks here).
 * GET /api/media/update?target=windows&arch=x86_64&current=1.0.0
 * → 204 when the app is up to date, or { version, notes, pub_date, url, signature } for a newer version.
 * Releases are published with scripts/publish-media-release.mjs, which writes media-releases/latest.json.
 */

interface Release {
  version: string;
  notes?: string;
  pub_date: string;
  platforms: Record<string, { key: string; signature: string }>;
}

let cache: { at: number; release: Release | null } | null = null;

async function latest(): Promise<Release | null> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.release;
  let release: Release | null = null;
  try {
    release = JSON.parse((await getObject("media-releases/latest.json")).toString("utf8")) as Release;
  } catch {
    release = null;
  }
  cache = { at: Date.now(), release };
  return release;
}

/** "1.2.10" > "1.2.9" (numbers only; anything after "-" is ignored). */
function newer(a: string, b: string): boolean {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const target = q.get("target") ?? "windows";
  const arch = q.get("arch") ?? "x86_64";
  const current = q.get("current") ?? "0.0.0";

  const r = await latest();
  const file = r?.platforms[`${target}-${arch}`];
  if (!r || !file || !newer(r.version, current)) return new NextResponse(null, { status: 204 });

  return NextResponse.json(
    {
      version: r.version,
      notes: r.notes ?? "",
      pub_date: r.pub_date,
      url: await signedGetUrl(file.key, 6 * 3600),
      signature: file.signature,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
