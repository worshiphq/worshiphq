import "server-only";
import { db } from "@/lib/db";
import type { GiftMethod } from "@prisma/client";

export const METHOD_LABEL: Record<GiftMethod, string> = {
  MTN_MoMo: "MTN MoMo",
  Telecel_Cash: "Telecel Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
};

export interface GiftRow {
  id: string;
  donor: string;
  amount: number;
  fund: string;
  method: string;
  date: string;
  recurring: boolean;
}

export async function getGiving(churchId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [gifts, monthAgg, recurringCount, monthGifts, funds] = await Promise.all([
    db.gift.findMany({
      where: { churchId },
      orderBy: { date: "desc" },
      take: 12,
      include: { person: { select: { firstName: true, lastName: true } }, fund: { select: { name: true } } },
    }),
    db.gift.aggregate({ _sum: { amount: true }, _avg: { amount: true }, where: { churchId, date: { gte: startOfMonth } } }),
    db.gift.count({ where: { churchId, recurring: true } }),
    db.gift.findMany({ where: { churchId, date: { gte: startOfMonth } }, include: { fund: { select: { name: true } } } }),
    db.fund.findMany({ where: { churchId }, select: { name: true, color: true } }),
  ]);

  const rows: GiftRow[] = gifts.map((g) => ({
    id: g.id,
    donor: g.person ? `${g.person.firstName} ${g.person.lastName}` : g.donorName ?? "Anonymous",
    amount: Number(g.amount),
    fund: g.fund?.name ?? "General",
    method: METHOD_LABEL[g.method],
    date: g.date.toISOString(),
    recurring: g.recurring,
  }));

  // Fund breakdown (this month)
  const byFund = new Map<string, number>();
  let momoCount = 0;
  for (const g of monthGifts) {
    byFund.set(g.fund?.name ?? "General", (byFund.get(g.fund?.name ?? "General") ?? 0) + Number(g.amount));
  }
  const momoTotal = await db.gift.count({ where: { churchId, date: { gte: startOfMonth }, method: { in: ["MTN_MoMo", "Telecel_Cash", "AirtelTigo"] } } });
  momoCount = momoTotal;

  const fundBreakdown = [...byFund.entries()].map(([name, value]) => ({ name, value }));

  return {
    rows,
    funds,
    stats: {
      monthTotal: Number(monthAgg._sum.amount ?? 0),
      avgGift: Math.round(Number(monthAgg._avg.amount ?? 0)),
      recurringCount,
      momoPct: monthGifts.length ? Math.round((momoCount / monthGifts.length) * 100) : 0,
    },
    fundBreakdown,
  };
}
