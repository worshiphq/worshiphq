import "server-only";
import { db } from "@/lib/db";
import type { GiftMethod } from "@prisma/client";
import { channelOf, fundKind, isCollectionGift, type Channel, type FundKind } from "@/lib/giving/channels";

export const METHOD_LABEL: Record<GiftMethod, string> = {
  MTN_MoMo: "MTN MoMo",
  Telecel_Cash: "Telecel Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
  Bank: "Bank",
};

export interface GiftRow {
  id: string;
  donor: string;
  photoUrl: string | null;
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

export type GivingKind = "all" | FundKind;

/** One gift to a person or fund (tithes and other named giving). */
export interface GiftEntry {
  type: "gift";
  id: string;
  donor: string;
  photoUrl: string | null;
  amount: number;
  fund: string;
  method: string;
  date: string;
  recurring: boolean;
}

/** A whole day's offertory: counted and banked together, shown as one total. */
export interface CollectionEntry {
  type: "collection";
  id: string;
  fund: string;
  date: string;
  total: number;
  channels: Record<Channel, number>;
  /** The parts: counted ones can be deleted; online/named ones are summarised. */
  lines: { id: string | null; channel: Channel; label: string; amount: number; count: number; deletable: boolean }[];
}

export type GivingEntry = GiftEntry | CollectionEntry;

const METHOD_NAME: Record<string, string> = { Cash: "Cash", MTN_MoMo: "MTN MoMo", Telecel_Cash: "Telecel Cash", AirtelTigo: "AirtelTigo", Card: "Card", Bank: "Bank" };
const PAGE = 15;

/**
 * Giving for one month: totals, a split by fund kind and channel, and a paged
 * activity list. Offertory is grouped per day (it's counted together) so there's
 * no list of names; tithes and other giving stay per person.
 */
export async function getGiving(churchId: string, opts: { year?: number; month?: number; kind?: GivingKind; page?: number } = {}) {
  const now = new Date();
  const year = opts.year ?? now.getFullYear();
  const month = opts.month ?? now.getMonth();
  const kind = opts.kind ?? "all";
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const prevStart = new Date(year, month - 1, 1);
  const prevEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const [gifts, prevAgg, recurringCount, funds] = await Promise.all([
    db.gift.findMany({
      where: { churchId, date: { gte: start, lte: end } },
      orderBy: { date: "desc" },
      include: { person: { select: { firstName: true, lastName: true, photoUrl: true } }, fund: { select: { name: true } } },
    }),
    db.gift.aggregate({ where: { churchId, date: { gte: prevStart, lte: prevEnd } }, _sum: { amount: true } }),
    db.gift.count({ where: { churchId, recurring: true } }),
    db.fund.findMany({ where: { churchId }, select: { name: true, color: true } }),
  ]);

  // Totals for the month (always every kind, so the cards stay put while you filter the list).
  const byKind: Record<FundKind, number> = { tithes: 0, offertory: 0, other: 0 };
  const byChannel: Record<Channel, number> = { cash: 0, momo: 0, bank: 0 };
  const byFund = new Map<string, number>();
  let total = 0;
  for (const g of gifts) {
    const amt = Number(g.amount);
    const name = g.fund?.name ?? "General";
    total += amt;
    byKind[fundKind(name)] += amt;
    byChannel[channelOf(g.method)] += amt;
    byFund.set(name, (byFund.get(name) ?? 0) + amt);
  }

  // The activity list.
  const entries: GivingEntry[] = [];
  const cols = new Map<string, CollectionEntry>();
  for (const g of gifts) {
    const fundName = g.fund?.name ?? "General";
    const k = fundKind(fundName);
    if (kind !== "all" && k !== kind) continue;
    const amt = Number(g.amount);
    if (k === "offertory") {
      const day = g.date.toISOString().slice(0, 10);
      const key = `${day}|${fundName}`;
      let c = cols.get(key);
      if (!c) {
        c = { type: "collection", id: `col:${key}`, fund: fundName, date: g.date.toISOString(), total: 0, channels: { cash: 0, momo: 0, bank: 0 }, lines: [] };
        cols.set(key, c);
        entries.push(c);
      }
      const ch = channelOf(g.method);
      c.total += amt;
      c.channels[ch] += amt;
      if (isCollectionGift(g)) {
        c.lines.push({ id: g.id, channel: ch, label: METHOD_NAME[g.method] ?? g.method, amount: amt, count: 1, deletable: true });
      } else {
        // Online and named gifts to the offertory fund: one summary line per channel.
        const ex = c.lines.find((l) => !l.deletable && l.channel === ch);
        if (ex) { ex.amount += amt; ex.count++; }
        else c.lines.push({ id: null, channel: ch, label: ch === "momo" ? "Mobile Money (online)" : ch === "bank" ? "Card (online)" : "Cash gifts", amount: amt, count: 1, deletable: false });
      }
    } else {
      entries.push({
        type: "gift",
        id: g.id,
        donor: g.person ? `${g.person.firstName} ${g.person.lastName}` : g.donorName ?? "Anonymous",
        photoUrl: g.person?.photoUrl ?? null,
        amount: amt,
        fund: fundName,
        method: METHOD_LABEL[g.method],
        date: g.date.toISOString(),
        recurring: g.recurring,
      });
    }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));

  const pages = Math.max(1, Math.ceil(entries.length / PAGE));
  const page = Math.min(Math.max(1, opts.page ?? 1), pages);

  return {
    year,
    month,
    kind,
    entries: entries.slice((page - 1) * PAGE, page * PAGE),
    pageInfo: { page, pages, total: entries.length, pageSize: PAGE },
    funds,
    stats: {
      total,
      prevTotal: Number(prevAgg._sum.amount ?? 0),
      byKind,
      byChannel,
      recurringCount,
      giftCount: gifts.length,
    },
    fundBreakdown: [...byFund.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}
