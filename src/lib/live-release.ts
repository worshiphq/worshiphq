import "server-only";
import { db } from "@/lib/db";
import { getObject, putObject } from "@/lib/storage";
import { verifyMediaToken } from "@/lib/media-license";

/**
 * WorshipHQ Live versions. Every installer ever uploaded is kept in media-releases/releases.json with what happened to
 * it; only published ones are offered to apps and on the download page. The newest published number wins.
 */
export interface LiveRelease {
  version: string;
  notes: string;
  key: string;
  signature: string;
  bytes: number;
  status: "draft" | "published" | "withdrawn";
  /** Who is offered it: every church, or only the testers in Pricing › Promotions. */
  audience: "all" | "testers";
  uploadedAt: string;
  log: { at: string; what: string; by?: string }[];
}

const INDEX = "media-releases/releases.json";
let cache: { at: number; list: LiveRelease[] } | null = null;

export async function listReleases(fresh = false): Promise<LiveRelease[]> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.list;
  let list: LiveRelease[] = [];
  try {
    list = JSON.parse((await getObject(INDEX)).toString("utf8")) as LiveRelease[];
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name !== "NoSuchKey" && name !== "NotFound") throw e;
  }
  list.sort((a, b) => (newer(a.version, b.version) ? -1 : 1));
  cache = { at: Date.now(), list };
  return list;
}

export async function saveReleases(list: LiveRelease[]): Promise<void> {
  await putObject(INDEX, Buffer.from(JSON.stringify(list, null, 1)), "application/json");
  cache = null;
}

/** "1.2.10" > "1.2.9" (numbers only; anything after "-" is ignored). */
export function newer(a: string, b: string): boolean {
  const pa = a.split("-")[0].split(".").map(Number), pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The newest version on offer. */
export async function latestRelease(tester: boolean): Promise<LiveRelease | null> {
  return (await listReleases()).find((r) => r.status === "published" && (r.audience === "all" || tester)) ?? null;
}

/** Is this request from an app signed in by one of the testers? */
export async function isTester(req: Request): Promise<boolean> {
  const auth = await verifyMediaToken(req.headers.get("authorization")).catch(() => null);
  if (!auth) return false;
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const [user, config] = await Promise.all([db.user.findUnique({ where: { id: auth.uid }, select: { email: true } }), getPlatformConfig()]);
  const email = user?.email?.trim().toLowerCase();
  return !!email && config.promotions.launch.testers.some((t) => t.trim().toLowerCase() === email);
}

/** Is there an installer for everyone to download? */
export async function liveInstallerReady(): Promise<boolean> {
  return !!(await latestRelease(false).catch(() => null));
}
