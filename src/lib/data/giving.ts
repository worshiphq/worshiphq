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

export interface TitheMember {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  photoUrl: string | null;
}

export interface TitheRecord {
  id: string;
  personId: string | null;
  donorName: string;
  amount: number;
  method: string;
  date: string;
  receiptSent: boolean;
  phone: string | null;
  photoUrl: string | null;
}

export interface WeekGroup {
  label: string;
  startDate: string;
  endDate: string;
  records: TitheRecord[];
  total: number;
}

export interface TitheData {
  members: TitheMember[];
  weeks: WeekGroup[];
  monthTotal: number;
  monthLabel: string;
  year: number;
  month: number;
}

function getWeeksInMonth(year: number, month: number): { label: string; start: Date; end: Date }[] {
  const weeks: { label: string; start: Date; end: Date }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let weekStart = new Date(firstDay);
  let weekNum = 1;
  while (weekStart <= lastDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + (6 - weekStart.getDay()));
    if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime());
    weekEnd.setHours(23, 59, 59, 999);
    weeks.push({
      label: `Week ${weekNum}`,
      start: new Date(weekStart),
      end: new Date(weekEnd),
    });
    weekNum++;
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 1);
    weekStart.setHours(0, 0, 0, 0);
  }
  return weeks;
}

export async function getTitheData(churchId: string, year: number, month: number): Promise<TitheData> {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const titheFund = await db.fund.findFirst({
    where: { churchId, name: { equals: "Tithes", mode: "insensitive" } },
  });

  const [members, gifts] = await Promise.all([
    db.person.findMany({
      where: { churchId, status: { in: ["active", "visitor"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true },
    }),
    titheFund
      ? db.gift.findMany({
          where: { churchId, fundId: titheFund.id, date: { gte: startOfMonth, lte: endOfMonth } },
          orderBy: { date: "desc" },
          include: { person: { select: { firstName: true, lastName: true, phone: true, photoUrl: true } } },
        })
      : [],
  ]);

  const weekDefs = getWeeksInMonth(year, month);
  const weeks: WeekGroup[] = weekDefs.map((w) => {
    const weekGifts = gifts.filter((g) => g.date >= w.start && g.date <= w.end);
    return {
      label: w.label,
      startDate: w.start.toISOString().slice(0, 10),
      endDate: w.end.toISOString().slice(0, 10),
      records: weekGifts.map((g) => ({
        id: g.id,
        personId: g.personId,
        donorName: g.person ? `${g.person.firstName} ${g.person.lastName}` : g.donorName ?? "Anonymous",
        amount: Number(g.amount),
        method: METHOD_LABEL[g.method],
        date: g.date.toISOString(),
        receiptSent: g.receiptSent,
        phone: g.person?.phone ?? null,
        photoUrl: g.person?.photoUrl ?? null,
      })),
      total: weekGifts.reduce((sum, g) => sum + Number(g.amount), 0),
    };
  });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return {
    members,
    weeks,
    monthTotal: gifts.reduce((sum, g) => sum + Number(g.amount), 0),
    monthLabel: `${monthNames[month]} ${year}`,
    year,
    month,
  };
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
