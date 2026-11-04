import "server-only";
import { db } from "@/lib/db";
import { getSmsRates } from "@/lib/sms/cost";

export type CostLine = { label: string; texts: number; sent: number; cost: number };
export type SmsCostSummary = {
  ready: boolean;
  /** WorshipHQ's own texts: sign-in codes, alerts, notices, donor receipts. */
  own: { texts: number; sent: number; cost: number; byPurpose: CostLine[]; byCarrier: CostLine[] };
  /** Texts churches sent from their credits. */
  churches: { sends: number; sent: number; cost: number; estimated: boolean };
  total: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * What our SMS cost us in a window. Every text since cost tracking began has its real cost recorded, from the price
 * set for its carrier on the day. Church sends from before then have no cost stored, so they are estimated from
 * the credits they used at today's Hubtel price, and the summary says so.
 */
export async function getSmsCostSummary(since?: Date): Promise<SmsCostSummary> {
  const when = since ? { createdAt: { gte: since } } : {};
  const empty: SmsCostSummary = { ready: false, own: { texts: 0, sent: 0, cost: 0, byPurpose: [], byCarrier: [] }, churches: { sends: 0, sent: 0, cost: 0, estimated: false }, total: 0 };
  try {
    const rates = await getSmsRates();
    const [byPurpose, byCarrier, costed, older] = await Promise.all([
      db.platformSmsLog.groupBy({ by: ["purpose"], where: when, _count: { _all: true }, _sum: { sent: true, costGhs: true } }),
      db.platformSmsLog.groupBy({ by: ["carrier"], where: when, _count: { _all: true }, _sum: { sent: true, costGhs: true } }),
      db.smsAuditLog.aggregate({ where: { ...when, costGhs: { not: null } }, _count: { _all: true }, _sum: { sent: true, costGhs: true } }),
      db.smsAuditLog.aggregate({ where: { ...when, costGhs: null }, _count: { _all: true }, _sum: { sent: true, credits: true } }),
    ]);
    const line = (label: string | null, r: { _count: { _all: number }; _sum: { sent: number | null; costGhs: number | null } }): CostLine =>
      ({ label: label || "Other", texts: r._count._all, sent: r._sum.sent ?? 0, cost: round(r._sum.costGhs ?? 0) });
    const purposes = byPurpose.map((r) => line(r.purpose, r)).sort((a, b) => b.cost - a.cost || b.texts - a.texts);
    const carriers = byCarrier.map((r) => line(r.carrier, r)).sort((a, b) => b.cost - a.cost);
    const own = {
      texts: purposes.reduce((t, l) => t + l.texts, 0),
      sent: purposes.reduce((t, l) => t + l.sent, 0),
      cost: round(purposes.reduce((t, l) => t + l.cost, 0)),
      byPurpose: purposes,
      byCarrier: carriers,
    };
    const estimate = Math.abs(older._sum.credits ?? 0) * rates.hubtel;
    const churches = {
      sends: costed._count._all + older._count._all,
      sent: (costed._sum.sent ?? 0) + (older._sum.sent ?? 0),
      cost: round((costed._sum.costGhs ?? 0) + estimate),
      estimated: older._count._all > 0,
    };
    return { ready: true, own, churches, total: round(own.cost + churches.cost) };
  } catch {
    return empty;
  }
}
