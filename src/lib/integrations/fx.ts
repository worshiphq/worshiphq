import "server-only";
import { db } from "@/lib/db";

/**
 * Live USD→GHS exchange rate.
 *
 * Prices are shown in USD but charged in GHS at Paystack, so we need an
 * up-to-date conversion. We pull it from a free, key-less FX API, cache it in
 * memory, and mirror it into PlatformConfig.usdToGhsRate so cold instances and
 * the DB fallback stay recent. `getUsdToGhsRate()` never blocks a render — it
 * returns the freshest value it has and refreshes in the background.
 */

const TTL_MS = 6 * 60 * 60 * 1000; // refresh at most every 6 hours
const FETCH_TIMEOUT_MS = 3500;

let cache: { rate: number; at: number } | null = null;
let inflight: Promise<void> | null = null;

/** Fetch the current USD→GHS rate. Returns null on any failure. */
export async function fetchUsdToGhs(): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // open.er-api.com is free and needs no API key; falls back below on error.
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
      // Let Next cache at the fetch layer too, as a secondary guard.
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rate = Number(data?.rates?.GHS);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function refresh() {
  try {
    const rate = await fetchUsdToGhs();
    if (rate && rate > 0) {
      cache = { rate, at: Date.now() };
      // Mirror into the DB so it's the persistent fallback for cold instances.
      await db.platformConfig
        .update({ where: { id: "default" }, data: { usdToGhsRate: rate } })
        .catch(() => {});
    }
  } finally {
    inflight = null;
  }
}

/**
 * Return the best USD→GHS rate available right now, without blocking. If the
 * cached rate is stale (or missing), a background refresh is kicked off for the
 * next call. `fallback` is the DB-stored rate (or a sane default).
 */
export function getUsdToGhsRate(fallback: number): number {
  const fresh = cache && Date.now() - cache.at < TTL_MS;
  if (!fresh && !inflight) inflight = refresh();
  return cache?.rate ?? fallback;
}

/** Force a synchronous refresh (admin "refresh now" + daily cron). */
export async function refreshUsdToGhsRate(): Promise<number | null> {
  const rate = await fetchUsdToGhs();
  if (rate && rate > 0) {
    cache = { rate, at: Date.now() };
    await db.platformConfig
      .update({ where: { id: "default" }, data: { usdToGhsRate: rate } })
      .catch(() => {});
    return rate;
  }
  return null;
}
