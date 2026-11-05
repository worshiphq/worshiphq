import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const PLEDGE_PAGE = 25;

export interface PledgeListRow {
  id: string;
  donorName: string;
  donorPhone: string | null;
  donorType: string;
  amount: number;
  fulfilled: number;
  dueAt: string | null;
  campaignName: string | null;
  harvestLabel: string | null;
  notes: string | null;
  payments: { id: string; amount: number; method: string; note: string | null; date: string }[];
}

/** One page of pledges for a search (name, phone, campaign or harvest). The database does the matching and the paging. */
export async function queryPledges(churchId: string, search: string, pageWanted: number) {
  const q = search.trim().slice(0, 80);
  const has = { contains: q, mode: "insensitive" as const };
  const where: Prisma.PledgeWhereInput = {
    churchId,
    ...(q ? {
      OR: [
        { donorName: has }, { donorPhone: { contains: q } },
        { campaign: { is: { name: has } } },
        { harvest: { is: { title: has } } },
        ...(/^\d{4}$/.test(q) ? [{ harvest: { is: { year: Number(q) } } }] : []),
      ],
    } : {}),
  };
  const total = await db.pledge.count({ where });
  const pages = Math.max(1, Math.ceil(total / PLEDGE_PAGE));
  const page = Math.min(Math.max(1, Math.floor(pageWanted || 1)), pages);
  const pledges = await db.pledge.findMany({
    where,
    include: {
      campaign: { select: { name: true } },
      harvest: { select: { year: true, title: true } },
      payments: { orderBy: { date: "desc" } },
    },
    orderBy: [{ dueAt: "asc" }, { donorName: "asc" }, { id: "asc" }],
    skip: (page - 1) * PLEDGE_PAGE,
    take: PLEDGE_PAGE,
  });
  const rows: PledgeListRow[] = pledges.map((p) => ({
    id: p.id,
    donorName: p.donorName,
    donorPhone: p.donorPhone,
    donorType: p.donorType,
    amount: Number(p.amount),
    fulfilled: Number(p.fulfilled),
    dueAt: p.dueAt?.toISOString() ?? null,
    campaignName: p.campaign?.name ?? null,
    harvestLabel: p.harvest ? `${p.harvest.title} ${p.harvest.year}` : null,
    notes: p.notes,
    payments: p.payments.map((pay) => ({
      id: pay.id,
      amount: Number(pay.amount),
      method: String(pay.method).replace(/_/g, " "),
      note: pay.note,
      date: pay.date.toISOString(),
    })),
  }));
  return { rows, total, page };
}

/** Totals across every pledge (not just the page on screen). */
export async function pledgeTotals(churchId: string) {
  const a = await db.pledge.aggregate({ where: { churchId }, _sum: { amount: true, fulfilled: true } });
  const pledged = Number(a._sum.amount ?? 0);
  const paid = Number(a._sum.fulfilled ?? 0);
  // Outstanding is what is still owed on pledges not yet fully paid; overpaid pledges owe nothing.
  const rows = await db.$queryRaw<{ owed: number | null }[]>`
    SELECT COALESCE(SUM(GREATEST("amount" - "fulfilled", 0)), 0)::float AS owed FROM "Pledge" WHERE "churchId" = ${churchId}`;
  return { pledged, paid, outstanding: Number(rows[0]?.owed ?? 0) };
}
