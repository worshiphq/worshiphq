import "server-only";
import { db } from "@/lib/db";
import { ymdInTz, zonedToUtc } from "@/lib/time/tz";
import { fundKind, isCollectionGift } from "@/lib/giving/channels";
import { getAccountOptions } from "@/lib/data/accounts";
import { safeTz } from "@/lib/levies/engine";
import { MONTH_SHORT } from "@/lib/levies/periods";
import { weekStartOf, shiftYmd, type ServiceCard, type ServiceWeekData, type ServiceMonthData, type UntaggedGift } from "@/lib/service-income/types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayStart = (ymd: string, tz: string) => zonedToUtc(ymd, "00:00", tz);

export async function churchTzFor(churchId: string) {
  const c = await db.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  return safeTz(c?.timezone);
}

const SHEET_INCLUDE = {
  gifts: { select: { id: true, fundId: true, amount: true, method: true, accountId: true, pendingDeposit: true, donorName: true, reference: true, fund: { select: { name: true } } } },
  session: { select: { adults: true, teens: true, children: true, visitors: true } },
} as const;

type SheetRow = {
  id: string; date: Date; serviceName: string; sessionId: string | null; slotId: string | null; headcount: number | null; countedBy: string | null; note: string | null;
  gifts: { id: string; fundId: string | null; amount: { toString(): string }; method: string; accountId: string | null; pendingDeposit: boolean; donorName: string | null; reference: string | null; fund: { name: string } | null }[];
  session: { adults: number; teens: number; children: number; visitors: number } | null;
};

function toCard(s: SheetRow, tz: string): ServiceCard {
  const gifts = s.gifts.map((g) => ({
    id: g.id, fundId: g.fundId, fund: g.fund?.name ?? "General giving", amount: Number(g.amount), method: g.method, accountId: g.accountId,
    pending: g.pendingDeposit, donorName: g.donorName, counted: isCollectionGift(g),
  }));
  const byFundMap = new Map<string, { fundId: string | null; name: string; total: number }>();
  for (const g of gifts) {
    const k = g.fundId ?? "none";
    const e = byFundMap.get(k) ?? { fundId: g.fundId, name: g.fund, total: 0 };
    e.total = r2(e.total + g.amount);
    byFundMap.set(k, e);
  }
  const total = r2(gifts.reduce((t, g) => t + g.amount, 0));
  const sessionCount = s.session ? s.session.adults + s.session.teens + s.session.children + s.session.visitors : null;
  const attendance = sessionCount && sessionCount > 0 ? sessionCount : s.headcount ?? null;
  return {
    id: s.id, dateYmd: ymdInTz(s.date, tz), serviceName: s.serviceName, sessionId: s.sessionId, slotId: s.slotId, headcount: s.headcount,
    attendance, attendanceFrom: sessionCount && sessionCount > 0 ? "session" : s.headcount ? "headcount" : null,
    countedBy: s.countedBy, note: s.note, total, perPerson: attendance ? r2(total / attendance) : null,
    byFund: [...byFundMap.values()].sort((a, b) => b.total - a.total), gifts,
  };
}

/** One week (Sunday to Saturday) of service records, with the giving that day not yet tied to a service. */
export async function getServiceWeek(churchId: string, anyDayYmd: string | null, access: ServiceWeekData["access"]): Promise<ServiceWeekData> {
  const tz = await churchTzFor(churchId);
  const today = ymdInTz(new Date(), tz);
  const start = weekStartOf(anyDayYmd && /^\d{4}-\d{2}-\d{2}$/.test(anyDayYmd) ? anyDayYmd : today);
  const end = shiftYmd(start, 7);
  const from = dayStart(start, tz);
  const to = dayStart(end, tz);
  const [sheets, lastWeek, untagged, funds, slots, sessions, accounts] = await Promise.all([
    db.serviceIncome.findMany({ where: { churchId, date: { gte: from, lt: to } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], include: SHEET_INCLUDE }),
    db.gift.aggregate({ where: { churchId, serviceIncomeId: { not: null }, date: { gte: dayStart(shiftYmd(start, -7), tz), lt: from } }, _sum: { amount: true } }),
    db.gift.findMany({ where: { churchId, serviceIncomeId: null, date: { gte: from, lt: to } }, orderBy: { date: "asc" }, take: 300, select: { id: true, date: true, amount: true, method: true, donorName: true, fund: { select: { name: true } } } }),
    db.fund.findMany({ where: { churchId }, select: { id: true, name: true, inServiceSheet: true }, orderBy: { name: "asc" } }),
    db.serviceSlot.findMany({ where: { churchId, active: true }, select: { id: true, name: true, weekday: true, startMinute: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.attendanceSession.findMany({ where: { churchId, date: { gte: from, lt: to } }, select: { id: true, serviceName: true, date: true, adults: true, teens: true, children: true, visitors: true }, orderBy: { date: "asc" } }),
    getAccountOptions(churchId),
  ]);
  const services = sheets.map((s) => toCard(s, tz));
  return {
    weekStartYmd: start, weekEndYmd: shiftYmd(end, -1), todayYmd: today, services,
    weekTotal: r2(services.reduce((t, s) => t + s.total, 0)), lastWeekTotal: Number(lastWeek._sum.amount ?? 0),
    untagged: untagged.map((g): UntaggedGift => ({ id: g.id, dateYmd: ymdInTz(g.date, tz), fund: g.fund?.name ?? "General giving", amount: Number(g.amount), method: g.method, donorName: g.donorName })),
    funds: funds.map((f) => ({ ...f, kind: fundKind(f.name) })),
    slots,
    sessions: sessions.map((s) => ({ id: s.id, serviceName: s.serviceName, dateYmd: ymdInTz(s.date, tz), total: s.adults + s.teens + s.children + s.visitors })),
    accounts, access,
  };
}

/** A month as a grid: each kind of income against each week, for services only. */
export async function getServiceMonth(churchId: string, year: number, month: number): Promise<ServiceMonthData> {
  const tz = await churchTzFor(churchId);
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const next = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, "0")}-01`;
  const sheets = await db.serviceIncome.findMany({ where: { churchId, date: { gte: dayStart(first, tz), lt: dayStart(next, tz) } }, include: SHEET_INCLUDE, orderBy: { date: "asc" } });
  const cards = sheets.map((s) => toCard(s, tz));
  const weeks: ServiceMonthData["weeks"] = [];
  for (let w = weekStartOf(first); w < next; w = shiftYmd(w, 7)) {
    const lo = w < first ? first : w;
    const hiEx = shiftYmd(w, 7) > next ? next : shiftYmd(w, 7);
    const inW = cards.filter((c) => c.dateYmd >= lo && c.dateYmd < hiEx);
    const [, , d1] = lo.split("-").map(Number);
    const [, , d2] = shiftYmd(hiEx, -1).split("-").map(Number);
    weeks.push({ key: lo, label: `${d1} to ${d2} ${MONTH_SHORT[month]}`, from: lo, to: shiftYmd(hiEx, -1), services: inW.length, attendance: inW.reduce((t, c) => t + (c.attendance ?? 0), 0), total: r2(inW.reduce((t, c) => t + c.total, 0)) });
  }
  const names = [...new Set(cards.flatMap((c) => c.byFund.map((f) => f.name)))];
  const rows = names.map((name) => {
    const cells = weeks.map((w) => r2(cards.filter((c) => c.dateYmd >= w.from && c.dateYmd <= w.to).reduce((t, c) => t + (c.byFund.find((f) => f.name === name)?.total ?? 0), 0)));
    return { name, cells, total: r2(cells.reduce((a, b) => a + b, 0)) };
  }).sort((a, b) => b.total - a.total);
  return {
    year, month, weeks, rows, total: r2(cards.reduce((t, c) => t + c.total, 0)), services: cards.length,
    attendance: cards.reduce((t, c) => t + (c.attendance ?? 0), 0),
  };
}

/** One page of service records, newest first, for the searchable history. */
export async function queryServiceSheets(churchId: string, search: string, filters: { year?: number }, page: number) {
  const tz = await churchTzFor(churchId);
  const q = search.trim().slice(0, 60);
  const where = {
    churchId,
    ...(filters.year ? { date: { gte: dayStart(`${filters.year}-01-01`, tz), lt: dayStart(`${filters.year + 1}-01-01`, tz) } } : {}),
    ...(q ? { OR: [{ serviceName: { contains: q, mode: "insensitive" as const } }, { countedBy: { contains: q, mode: "insensitive" as const } }, { note: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const p = Math.max(1, Math.floor(page) || 1);
  const [rows, total] = await Promise.all([
    db.serviceIncome.findMany({ where, orderBy: { date: "desc" }, skip: (p - 1) * 20, take: 20, include: SHEET_INCLUDE }),
    db.serviceIncome.count({ where }),
  ]);
  return { rows: rows.map((r) => toCard(r, tz)), total, page: p };
}

/** Gifts recorded on a local day that are not tied to any service yet. */
export async function untaggedGiftsOn(churchId: string, ymd: string): Promise<UntaggedGift[]> {
  const tz = await churchTzFor(churchId);
  const gifts = await db.gift.findMany({
    where: { churchId, serviceIncomeId: null, date: { gte: dayStart(ymd, tz), lt: dayStart(shiftYmd(ymd, 1), tz) } },
    orderBy: { date: "asc" }, take: 200,
    select: { id: true, date: true, amount: true, method: true, donorName: true, fund: { select: { name: true } } },
  });
  return gifts.map((g) => ({ id: g.id, dateYmd: ymdInTz(g.date, tz), fund: g.fund?.name ?? "General giving", amount: Number(g.amount), method: g.method, donorName: g.donorName }));
}

export async function getServiceSheet(churchId: string, id: string): Promise<ServiceCard | null> {
  const tz = await churchTzFor(churchId);
  const s = await db.serviceIncome.findFirst({ where: { id, churchId }, include: SHEET_INCLUDE });
  return s ? toCard(s, tz) : null;
}
