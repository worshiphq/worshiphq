import "server-only";
import { db } from "@/lib/db";
import { personSearchAnd } from "@/lib/data/person-search";

export const STATEMENT_PAGE = 25;

export interface DonorRow {
  id: string;
  name: string;
  memberId: string | null;
  total: number;
  giftCount: number;
  fundCount: number;
}

export interface StatementDetail {
  id: string;
  name: string;
  memberId: string | null;
  phone: string | null;
  email: string | null;
  total: number;
  giftCount: number;
  byFund: { fund: string; amount: number }[];
  gifts: { id: string; amount: number; date: string; method: string; fund: string }[];
}

const yearStart = (year: number) => new Date(year, 0, 1);

/** One page of the people who have given this year, matching the search. Totals are worked out in the database. */
export async function queryDonors(churchId: string, year: number, search: string, pageWanted: number) {
  const where = {
    churchId,
    gifts: { some: { date: { gte: yearStart(year) } } },
    AND: await personSearchAnd(churchId, search),
  };
  const total = await db.person.count({ where });
  const pages = Math.max(1, Math.ceil(total / STATEMENT_PAGE));
  const page = Math.min(Math.max(1, Math.floor(pageWanted || 1)), pages);
  const people = await db.person.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
    skip: (page - 1) * STATEMENT_PAGE,
    take: STATEMENT_PAGE,
    select: { id: true, firstName: true, lastName: true, memberId: true },
  });
  const ids = people.map((p) => p.id);
  const sums = ids.length
    ? await db.gift.groupBy({
      by: ["personId", "fundId"],
      where: { churchId, personId: { in: ids }, date: { gte: yearStart(year) } },
      _sum: { amount: true },
      _count: { _all: true },
    })
    : [];
  const agg = new Map<string, { total: number; count: number; funds: number }>();
  for (const s of sums) {
    if (!s.personId) continue;
    const a = agg.get(s.personId) ?? { total: 0, count: 0, funds: 0 };
    a.total += Number(s._sum.amount ?? 0);
    a.count += s._count._all;
    a.funds += 1;
    agg.set(s.personId, a);
  }
  const rows: DonorRow[] = people.map((p) => {
    const a = agg.get(p.id);
    return { id: p.id, name: `${p.firstName} ${p.lastName}`, memberId: p.memberId, total: a?.total ?? 0, giftCount: a?.count ?? 0, fundCount: a?.funds ?? 0 };
  });
  return { rows, total, page };
}

/** The full statement for one person: every gift this year and the total per fund. Loaded when the row is opened. */
export async function getStatement(churchId: string, year: number, personId: string): Promise<StatementDetail | null> {
  const p = await db.person.findFirst({
    where: { id: personId, churchId },
    select: {
      id: true, firstName: true, lastName: true, phone: true, email: true, memberId: true,
      gifts: {
        where: { date: { gte: yearStart(year) } },
        select: { id: true, amount: true, date: true, method: true, fund: { select: { name: true } } },
        orderBy: { date: "asc" },
      },
    },
  });
  if (!p) return null;
  const byFund: Record<string, number> = {};
  for (const g of p.gifts) {
    const name = g.fund?.name ?? "General";
    byFund[name] = (byFund[name] ?? 0) + Number(g.amount);
  }
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    memberId: p.memberId,
    phone: p.phone,
    email: p.email,
    total: p.gifts.reduce((s, g) => s + Number(g.amount), 0),
    giftCount: p.gifts.length,
    byFund: Object.entries(byFund).map(([fund, amount]) => ({ fund, amount })),
    gifts: p.gifts.map((g) => ({ id: g.id, amount: Number(g.amount), date: g.date.toISOString(), method: g.method, fund: g.fund?.name ?? "General" })),
  };
}
