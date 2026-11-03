import "server-only";
import { db } from "@/lib/db";

/**
 * Are we safe on SMS?
 *
 * Churches buy credits from us. We buy SMS from the provider. The one thing that must never happen is that
 * churches hold more credits than we have stock to send, because then a church that PAID cannot send.
 *
 *   stock we still hold  = SMS we bought  -  SMS churches have sent
 *   what we have promised = credits sitting in churches' balances
 *   cushion              = stock - promised          (negative = oversold)
 *
 * Not counted, and the page says so: our own sends (sign-in codes, alerts, sender-ID updates) and anything
 * HostHub sends on the same Hubtel account. Those use stock too, so the real cushion is a little smaller.
 * Check it against the balance Hubtel shows now and then.
 *
 * Reads tolerate the table not existing yet (sql/sms-purchases.sql), so the page shows "set up" instead of failing.
 */

export type SmsPurchaseRow = { id: string; credits: number; costGhs: number; provider: string | null; note: string | null; purchasedAt: Date };

export type SmsStock = {
  ready: boolean;
  purchases: SmsPurchaseRow[];
  bought: number;
  spentGhs: number;
  /** What a credit really cost us, averaged over what was bought. Null until something is entered. */
  avgCost: number | null;
  sent: number;
  held: number;
  promised: number;
  cushion: number;
  /** ok | low (cushion under 15% of what is promised) | over (we have sold more than we hold) | none (nothing entered yet) */
  level: "ok" | "low" | "over" | "none";
};

export async function getSmsStock(): Promise<SmsStock> {
  const [usage, balances] = await Promise.all([
    db.smsTransaction.aggregate({ where: { kind: "usage", church: { isDemo: false } }, _sum: { credits: true } }),
    db.church.aggregate({ where: { isDemo: false, smsCredits: { gt: 0 } }, _sum: { smsCredits: true } }),
  ]);
  const sent = Math.abs(usage._sum.credits ?? 0);
  const promised = balances._sum.smsCredits ?? 0;

  let purchases: SmsPurchaseRow[] = [];
  let ready = true;
  try {
    purchases = await db.smsPurchase.findMany({ orderBy: { purchasedAt: "desc" }, take: 200 });
  } catch {
    ready = false;
  }

  const bought = purchases.reduce((t, p) => t + p.credits, 0);
  const spentGhs = purchases.reduce((t, p) => t + p.costGhs, 0);
  const held = bought - sent;
  const cushion = held - promised;
  const level: SmsStock["level"] = bought === 0 ? "none" : cushion < 0 ? "over" : cushion < promised * 0.15 ? "low" : "ok";

  return { ready, purchases, bought, spentGhs, avgCost: bought > 0 ? spentGhs / bought : null, sent, held, promised, cushion, level };
}
