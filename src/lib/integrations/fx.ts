import "server-only";
import { db } from "@/lib/db";

/**
 * Live USD→GHS exchange rate.
 *
 * Prices are shown in USD but charged in GHS at Paystack, so we need an
 * up-to-date conversion. We pull it from a free, key-less FX API, cache it in
 * memory, and mirror it into PlatformConfig.usdToGhsRate so cold instances and
 * the DB fallback stay recent. `getUsdToGhsRate()` never blocks a render - it
 * returns the freshest value it has and refreshes in the background.
 *
 * Two safety nets sit on top of the raw fetch:
 *  - a step clamp, so one noisy reading can't jump the price a church sees in a single refresh
 *  - a staleness check, so a dead feed gets noticed (by the platform owner) instead of silently
 *    charging an outdated rate forever
 */

const TTL_MS = 6 * 60 * 60 * 1000; // refresh at most every 6 hours
const FETCH_TIMEOUT_MS = 3500;
/** Smooth a single refresh to at most this fraction of a move. A real, sustained move still gets there -
 *  just over a few 6-hourly refreshes instead of in one jump - so churches never see the price lurch. */
const MAX_STEP_FRACTION = 0.05;

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

/** Cap how far a single refresh can move the rate from what we last had, so one noisy reading can't swing
 *  the GHS price churches see in one step. Returns `next` unchanged when there is nothing to clamp against. */
function clampStep(current: number | null, next: number): number {
  if (!current || current <= 0) return next;
  const maxDelta = current * MAX_STEP_FRACTION;
  if (next - current > maxDelta) return current + maxDelta;
  if (current - next > maxDelta) return current - maxDelta;
  return next;
}

/** The best "current" rate to clamp the next reading against: the in-memory cache if we have one, else
 *  whatever is stored in the DB right now. */
async function currentRate(): Promise<number | null> {
  if (cache?.rate) return cache.rate;
  try {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { usdToGhsRate: true } });
    return cfg?.usdToGhsRate ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirror the rate into the database. `usdToGhsRate`/`updatedAt` only move when the change is more than a
 * cedi-cent, same as before (so unrelated reads of `updatedAt` elsewhere aren't churned by noise). But
 * `fxRateCheckedAt` is stamped on every call, successful change or not, because it exists purely to answer
 * "did the live fetch actually run recently?" - see checkFxStaleness(). One statement that never waits: if
 * the settings row is locked, it simply does nothing (an old frozen serverless function holding a lock used
 * to starve every other instance; FOR UPDATE SKIP LOCKED avoids that).
 */
async function persistRate(rate: number): Promise<void> {
  try {
    await db.$executeRaw`WITH r AS (SELECT id FROM "PlatformConfig" WHERE id = 'default' FOR UPDATE SKIP LOCKED)
      UPDATE "PlatformConfig" p SET
        "usdToGhsRate" = CASE WHEN ABS(p."usdToGhsRate" - ${rate}) > 0.01 THEN ${rate} ELSE p."usdToGhsRate" END,
        "updatedAt" = CASE WHEN ABS(p."usdToGhsRate" - ${rate}) > 0.01 THEN now() ELSE p."updatedAt" END,
        "fxRateCheckedAt" = now()
      FROM r WHERE p.id = r.id`;
  } catch {
    // Defensive only: the column is confirmed present in production as of 2 Nov 2026. Falls back to the
    // plain update if some other environment hasn't migrated, so the rate itself still persists either way.
    await db
      .$executeRaw`WITH r AS (SELECT id FROM "PlatformConfig" WHERE id = 'default' FOR UPDATE SKIP LOCKED)
        UPDATE "PlatformConfig" p SET "usdToGhsRate" = ${rate}, "updatedAt" = now()
        FROM r WHERE p.id = r.id AND ABS(p."usdToGhsRate" - ${rate}) > 0.01`
      .catch(() => {});
  }
}

async function refresh() {
  try {
    const raw = await fetchUsdToGhs();
    if (raw && raw > 0) {
      const rate = clampStep(await currentRate(), raw);
      cache = { rate, at: Date.now() };
      await persistRate(rate);
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
  const raw = await fetchUsdToGhs();
  if (raw && raw > 0) {
    const rate = clampStep(await currentRate(), raw);
    cache = { rate, at: Date.now() };
    await persistRate(rate);
    return rate;
  }
  return null;
}

/**
 * Has the live rate feed gone quiet for too long? Checked once a day by the automations cron, which alerts
 * the platform owner (not any church) while it stays true. Deliberately keys off `fxRateCheckedAt`, not
 * `updatedAt` - any unrelated SuperAdmin save to PlatformConfig (a plan edit, SMS tier, alert phone, ...)
 * also bumps `updatedAt`, which would otherwise mask a feed that has actually been dead for days.
 */
export async function checkFxStaleness(thresholdHours = 48): Promise<{ stale: boolean; hoursSince: number | null }> {
  try {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { fxRateCheckedAt: true } });
    if (!cfg?.fxRateCheckedAt) return { stale: true, hoursSince: null }; // never fetched successfully
    const hoursSince = (Date.now() - cfg.fxRateCheckedAt.getTime()) / 3_600_000;
    return { stale: hoursSince >= thresholdHours, hoursSince };
  } catch {
    // Defensive only: the column is confirmed present in production as of 2 Nov 2026.
    return { stale: false, hoursSince: null };
  }
}
