import "server-only";
import { db } from "@/lib/db";

/**
 * Are we safe on SMS?
 *
 * Churches buy credits from us; we top up the provider (Hubtel) with money, and it deducts a fixed price per
 * SMS segment as messages go out. The thing that must never happen is that churches hold more credits than the
 * provider balance can send, because then a church that PAID cannot send.
 *
 * STARTING POINT. The owner records a reading of the provider balance ("Hubtel shows GHS 105.98"). From then on
 * only what happened AFTER the reading is counted: top-ups add to it, and SMS churches send take from it. That
 * avoids needing the whole purchase history. With no reading yet it falls back to top-ups minus everything ever sent.
 *
 *   held now      = reading + top-ups since - (credits churches sent since x provider cost per credit)
 *   committed     = credits churches hold that were BOUGHT or GIFTED (they are in the ledger)
 *   free trial    = credits churches hold that came free at signup (30 each, no ledger entry), mostly never used
 *   cushion       = held - committed          <- the figure that decides the warning
 *   worst case    = held - (committed + free trial), if every church spent every free credit
 *
 * Not counted, and the page says so: our own sends (sign-in codes, alerts) and anything HostHub sends on the same
 * Hubtel account. They use balance too, which is why a fresh reading every so often beats any calculation.
 *
 * Reads tolerate the table or column not existing yet (sql/sms-purchases.sql, sql/sms-balance-readings.sql).
 */

export type SmsEntryRow = { id: string; kind: string; credits: number; costGhs: number; provider: string | null; note: string | null; purchasedAt: Date };

export type SmsStock = {
  ready: boolean;
  entries: SmsEntryRow[];
  /** The latest balance reading, if one has been entered. */
  reading: { amountGhs: number; at: Date } | null;
  costPerCredit: number;
  /** Cedis the provider account should hold now (reading + top-ups since, less what was sent since). */
  heldGhs: number;
  held: number;
  sentSince: number;
  toppedUpSince: number;
  /** Credits churches hold that were bought or gifted. */
  committed: number;
  /** Credits churches hold that came free at signup. */
  freeTrial: number;
  cushion: number;
  worstCushion: number;
  /** ok | low (cushion under 15% of committed) | over (committed exceeds what is held) | none (nothing entered yet) */
  level: "ok" | "low" | "over" | "none";
};

/** What Nalo charges per SMS segment. Starts at the quoted GH₵0.032; the owner changes it on the Revenue page. */
const NALO_COST_KEY = "sms-nalo-cost";
const DEFAULT_NALO_COST = 0.032;

export async function getNaloCostPerCredit(): Promise<number> {
  const row = await db.siteContent.findUnique({ where: { key: NALO_COST_KEY } }).catch(() => null);
  const v = Number((row?.value as { cost?: number } | null)?.cost);
  return v > 0 ? v : DEFAULT_NALO_COST;
}

export async function saveNaloCostPerCredit(cost: number): Promise<void> {
  await db.siteContent.upsert({ where: { key: NALO_COST_KEY }, update: { value: { cost } }, create: { key: NALO_COST_KEY, value: { cost } } });
}

/**
 * One carrier's account. Each has its own balance and price, so each gets its own answer. A church's sends and credits
 * count against the carrier it is set to NOW: moving a church moves its held credits straight away, and sends to numbers
 * outside Ghana from a Hubtel church really use Nalo, so a fresh reading is what keeps either figure honest.
 */
export async function getSmsStock(carrier: "hubtel" | "nalo" = "hubtel"): Promise<SmsStock> {
  const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { smsCostPerCredit: true } });
  const cost = carrier === "nalo" ? await getNaloCostPerCredit() : cfg?.smsCostPerCredit ?? 0.03;
  const onCarrier = carrier === "nalo" ? { smsProvider: "nalo" } : { OR: [{ smsProvider: null }, { smsProvider: { not: "nalo" } }] };

  let entries: SmsEntryRow[] = [];
  let ready = true;
  try {
    entries = await db.smsPurchase.findMany({ orderBy: { purchasedAt: "desc" }, take: 200 });
  } catch {
    ready = false;
  }

  // Entries saved before there were two carriers have the provider "Hubtel" or nothing.
  entries = entries.filter((e) => (e.provider?.toLowerCase() === "nalo") === (carrier === "nalo"));

  const readingRow = entries.find((e) => e.kind === "balance") ?? null;
  const since = readingRow?.purchasedAt ?? null;
  const topups = entries.filter((e) => e.kind !== "balance");
  const topupsSince = since ? topups.filter((e) => e.purchasedAt > since) : topups;

  const [usageSince, ledgerByChurch, trimsByChurch, churches] = await Promise.all([
    db.smsTransaction.aggregate({
      where: { kind: "usage", church: { isDemo: false, ...onCarrier }, ...(since ? { createdAt: { gt: since } } : {}) },
      _sum: { credits: true },
    }),
    db.smsTransaction.groupBy({ by: ["churchId"], where: { church: { isDemo: false } }, _sum: { credits: true } }),
    // Free-credit trims are adjustments to FREE credits, not to bought or gifted ones, so they are added back.
    db.smsTransaction.groupBy({ by: ["churchId"], where: { church: { isDemo: false }, adminNote: { startsWith: "Free credits trimmed" } }, _sum: { credits: true } }),
    db.church.findMany({ where: { isDemo: false, smsCredits: { gt: 0 }, ...onCarrier }, select: { id: true, smsCredits: true } }),
  ]);

  const sentSince = Math.abs(usageSince._sum.credits ?? 0);
  const toppedUpSince = topupsSince.reduce((t, e) => t + e.costGhs, 0);
  const start = readingRow ? readingRow.costGhs : 0;
  const heldGhs = Math.max(0, start + toppedUpSince - sentSince * cost);
  const held = cost > 0 ? Math.floor(heldGhs / cost) : 0;

  // What churches hold, split into what is in the ledger (bought or gifted) and the free signup credits (not).
  const trimmed = new Map(trimsByChurch.map((r) => [r.churchId, r._sum.credits ?? 0]));
  const ledger = new Map(ledgerByChurch.map((r) => [r.churchId, (r._sum.credits ?? 0) - (trimmed.get(r.churchId) ?? 0)]));
  let promised = 0;
  let committed = 0;
  for (const c of churches) {
    promised += c.smsCredits;
    committed += Math.min(c.smsCredits, Math.max(0, ledger.get(c.id) ?? 0));
  }
  const freeTrial = promised - committed;

  const cushion = held - committed;
  const worstCushion = held - promised;
  const hasBasis = readingRow !== null || topups.length > 0;
  const level: SmsStock["level"] = !hasBasis ? "none" : cushion < 0 ? "over" : cushion < committed * 0.15 ? "low" : "ok";

  return {
    ready, entries, costPerCredit: cost,
    reading: readingRow ? { amountGhs: readingRow.costGhs, at: readingRow.purchasedAt } : null,
    heldGhs, held, sentSince, toppedUpSince, committed, freeTrial, cushion, worstCushion, level,
  };
}
