import "server-only";
import { db } from "@/lib/db";

export interface WelfareMemberRow {
  id: string;
  name: string;
  hasPhone: boolean;
  monthsPaidInYear: number[]; // 1-12, for the selected year
  paidTotal: number;          // all-time dues paid
  owed: number;               // computed against yearly rates, from member's start, up to current month
  startLabel: string;         // e.g. "Jan 2025" — when dues start counting
  hasExplicitStart: boolean;  // true if welfareStart set (vs derived from joinedAt)
}

export interface WelfareData {
  currentYear: number;
  currentMonth: number; // 1-12
  selectedYear: number;
  years: number[];       // years to offer in the switcher
  rates: { year: number; amount: number }[];
  members: WelfareMemberRow[];
  aid: {
    id: string; recipientName: string; type: string; amount: number | null;
    description: string | null; date: string; personName: string | null;
  }[];
  collected: number;
  disbursed: number;
  totalOwed: number;
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Owed for a member given their start (y,m), the rates, and "now". */
function computeOwed(
  rates: { year: number; amount: number }[],
  paidByYear: Map<number, number>,
  start: { y: number; m: number },
  now: { y: number; m: number },
) {
  let owed = 0;
  for (const r of rates) {
    if (r.year < start.y || r.year > now.y) continue;
    const winStart = r.year === start.y ? start.m : 1;
    const winEnd = r.year === now.y ? now.m : 12;
    const months = Math.max(0, winEnd - winStart + 1);
    const expected = months * r.amount;
    owed += Math.max(0, expected - (paidByYear.get(r.year) ?? 0));
  }
  return owed;
}

export async function getWelfareData(churchId: string, year?: number): Promise<WelfareData> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const selectedYear = year ?? currentYear;

  const [members, rateRows, dues, aidRows] = await Promise.all([
    db.person.findMany({
      where: { churchId, status: { not: "inactive" } },
      select: { id: true, firstName: true, lastName: true, phone: true, welfareStart: true, joinedAt: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.welfareRate.findMany({ where: { churchId }, orderBy: { year: "desc" }, select: { year: true, amount: true } }),
    db.welfareDue.findMany({ where: { churchId }, select: { personId: true, year: true, month: true, amount: true } }),
    db.welfareRecord.findMany({
      where: { churchId, kind: "aid" },
      include: { person: { select: { firstName: true, lastName: true } } },
      orderBy: { date: "desc" },
      take: 200,
    }),
  ]);

  const rates = rateRows.map((r) => ({ year: r.year, amount: Number(r.amount) }));

  const byPerson = new Map<string, { total: number; perYear: Map<number, number>; monthsInYear: number[] }>();
  for (const d of dues) {
    const e = byPerson.get(d.personId) ?? { total: 0, perYear: new Map<number, number>(), monthsInYear: [] as number[] };
    const amt = Number(d.amount);
    e.total += amt;
    e.perYear.set(d.year, (e.perYear.get(d.year) ?? 0) + amt);
    if (d.year === selectedYear) e.monthsInYear.push(d.month);
    byPerson.set(d.personId, e);
  }

  const memberRows: WelfareMemberRow[] = members.map((m) => {
    const e = byPerson.get(m.id);
    const startDate = m.welfareStart ?? m.joinedAt ?? new Date(currentYear, 0, 1);
    const start = { y: startDate.getFullYear(), m: startDate.getMonth() + 1 };
    const owed = computeOwed(rates, e?.perYear ?? new Map(), start, { y: currentYear, m: currentMonth });
    return {
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      hasPhone: !!m.phone,
      monthsPaidInYear: (e?.monthsInYear ?? []).sort((a, b) => a - b),
      paidTotal: e?.total ?? 0,
      owed,
      startLabel: `${MONTHS_SHORT[start.m - 1]} ${start.y}`,
      hasExplicitStart: !!m.welfareStart,
    };
  });

  // Years to offer: from the earliest of (rates, dues) to current year.
  const yearsSet = new Set<number>([currentYear, selectedYear]);
  for (const r of rates) yearsSet.add(r.year);
  for (const d of dues) yearsSet.add(d.year);
  const minYear = Math.min(...yearsSet);
  const years: number[] = [];
  for (let y = currentYear + 1; y >= minYear; y--) years.push(y);

  return {
    currentYear,
    currentMonth,
    selectedYear,
    years,
    rates,
    members: memberRows,
    aid: aidRows.map((r) => ({
      id: r.id, recipientName: r.recipientName, type: r.type,
      amount: r.amount ? Number(r.amount) : null, description: r.description,
      date: r.date.toISOString(), personName: r.person ? `${r.person.firstName} ${r.person.lastName}` : null,
    })),
    collected: dues.reduce((s, d) => s + Number(d.amount), 0),
    disbursed: aidRows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    totalOwed: memberRows.reduce((s, m) => s + m.owed, 0),
  };
}

/** Full welfare history for one member — every paid month, plus start & owed. */
export async function getMemberDuesDetail(churchId: string, personId: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [person, rateRows, dues] = await Promise.all([
    db.person.findUnique({ where: { id: personId }, select: { firstName: true, lastName: true, welfareStart: true, joinedAt: true } }),
    db.welfareRate.findMany({ where: { churchId }, select: { year: true, amount: true } }),
    db.welfareDue.findMany({ where: { churchId, personId }, orderBy: [{ year: "desc" }, { month: "asc" }], select: { id: true, year: true, month: true, amount: true } }),
  ]);
  const rates = rateRows.map((r) => ({ year: r.year, amount: Number(r.amount) }));
  const paidByYear = new Map<number, number>();
  for (const d of dues) paidByYear.set(d.year, (paidByYear.get(d.year) ?? 0) + Number(d.amount));
  const startDate = person?.welfareStart ?? person?.joinedAt ?? new Date(currentYear, 0, 1);
  const start = { y: startDate.getFullYear(), m: startDate.getMonth() + 1 };
  const owed = computeOwed(rates, paidByYear, start, { y: currentYear, m: currentMonth });

  return {
    name: person ? `${person.firstName} ${person.lastName}`.trim() : "Member",
    welfareStart: person?.welfareStart ? person.welfareStart.toISOString().slice(0, 10) : null,
    joinedAt: person?.joinedAt ? person.joinedAt.toISOString().slice(0, 10) : null,
    owed,
    paidTotal: dues.reduce((s, d) => s + Number(d.amount), 0),
    dues: dues.map((d) => ({ id: d.id, year: d.year, month: d.month, amount: Number(d.amount) })),
  };
}

export async function memberOwedSummary(churchId: string, personId: string) {
  const detail = await getMemberDuesDetail(churchId, personId);
  const [person, church] = await Promise.all([
    db.person.findUnique({ where: { id: personId }, select: { firstName: true, phone: true } }),
    db.church.findUnique({ where: { id: churchId }, select: { name: true } }),
  ]);
  return { owed: detail.owed, firstName: person?.firstName ?? "", phone: person?.phone ?? null, churchName: church?.name ?? "your church" };
}
