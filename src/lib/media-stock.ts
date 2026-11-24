import "server-only";
import { getObject, putObject, signedGetUrl } from "@/lib/storage";
import { getMediaEntitlement, verifyMediaToken } from "@/lib/media-license";

/**
 * WorshipHQ stock backgrounds: pictures and motion loops churches can download inside WorshipHQ Live.
 * Files live in R2 under stock/, described by stock/manifest.json (no database table needed).
 * Only content WorshipHQ owns or is licensed to give out goes here.
 */

export const STOCK_PREFIX = "stock/";
const MANIFEST_KEY = `${STOCK_PREFIX}manifest.json`;

export interface StockItem {
  id: string;
  title: string;
  category: string;
  kind: "image" | "video";
  /** R2 keys, relative to stock/ */
  file: string;
  thumb: string;
  width: number;
  height: number;
  seconds?: number;
  bytes: number;
  hidden?: boolean;
  /** Who made it / the licence it is given out under. */
  credit?: string;
  addedAt?: string;
}

export interface StockManifest {
  version: number;
  credit?: string;
  items: StockItem[];
}

let cache: { at: number; data: StockManifest } | null = null;

export async function readStock(fresh = false): Promise<StockManifest> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.data;
  try {
    const data = JSON.parse((await getObject(MANIFEST_KEY)).toString("utf8")) as StockManifest;
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return { version: 1, items: [] };
  }
}

export async function writeStock(m: StockManifest): Promise<void> {
  await putObject(MANIFEST_KEY, Buffer.from(JSON.stringify(m, null, 1)), "application/json");
  cache = { at: Date.now(), data: m };
}

export const STOCK_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-WHQ-Licence",
  "Access-Control-Max-Age": "86400",
};

/**
 * A signed-in church with an active WorshipHQ Live subscription. (The old self-checked licence keys are no longer
 * accepted: their secret ships inside the app, so they could be forged.)
 */
export async function stockAccess(req: Request): Promise<boolean> {
  const auth = await verifyMediaToken(req.headers.get("authorization")).catch(() => null);
  if (!auth) return false;
  return (await getMediaEntitlement(auth.cid)).active;
}

/** The public list (no file links; those are handed out one at a time). */
export async function stockList() {
  const m = await readStock();
  const items = m.items.filter((i) => !i.hidden);
  return Promise.all(
    items.map(async (i) => ({
      id: i.id, title: i.title, category: i.category, kind: i.kind, width: i.width, height: i.height,
      seconds: i.seconds ?? null, bytes: i.bytes, credit: i.credit ?? m.credit ?? null,
      ext: i.file.split(".").pop() ?? (i.kind === "video" ? "mp4" : "jpg"),
      thumbUrl: await signedGetUrl(STOCK_PREFIX + i.thumb, 24 * 3600),
    })),
  );
}
