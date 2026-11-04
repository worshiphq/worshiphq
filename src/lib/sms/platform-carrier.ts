import "server-only";
import { db } from "@/lib/db";
import { ttlCached, ttlInvalidate } from "@/lib/ttl-cache";

/**
 * Which carrier WorshipHQ's OWN texts use: sign-in codes, owner alerts, notices. Churches' texts follow their own
 * setting on the Church row instead. Kept in SiteContent, so the site still runs if the row is missing: no row, or any
 * failure reading it, means the default carrier (Hubtel).
 */
const KEY = "platform-sms-carrier";

export type PlatformCarrier = "hubtel" | "nalo";

export function getPlatformCarrier(): Promise<PlatformCarrier | null> {
  return ttlCached(KEY, 30_000, async () => {
    try {
      const row = await db.siteContent.findUnique({ where: { key: KEY } });
      const v = (row?.value as { carrier?: string } | null)?.carrier;
      return v === "nalo" || v === "hubtel" ? v : null;
    } catch {
      return null;
    }
  });
}

export async function savePlatformCarrier(carrier: PlatformCarrier): Promise<void> {
  await db.siteContent.upsert({
    where: { key: KEY },
    update: { value: { carrier } },
    create: { key: KEY, value: { carrier } },
  });
  ttlInvalidate(KEY);
}
