import "server-only";
import { db } from "@/lib/db";

export interface WelfareMemberRow {
  id: string;
  name: string;
  hasPhone: boolean;
  monthsPaidThisYear: number[]; // 1-12
  paidTotal: number;            // all-time dues paid
  owed: number;                 // computed against yearly rates up to current month
}

export interface WelfareData {
  currentYear: number;
  currentMonth: number; // 1-12
  rates: { year: number; amount: number }[];
  members: WelfareMemberRow[];
  aid: {
    id: string; recipientName: string; type: string; amount: number | null;
    description: string | null; date: string; personName: string | null;
  }[];
  collected: number;   // total dues collected (all-time)
  disbursed: number;   // total aid given (all-time)
  totalOwed: number;   // sum of members' owed
}

export async function getWelfareData(churchId: string): Promise<WelfareData> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [members, rateRows, dues, aidRows] = await Promise.all([
    db.person.findMany({
      where: { churchId, status: { not: "inactive" } },
      select: { id: true, firstName: true, lastName: true, phone: true },
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
  const rateByYear = new Map(rates.map((r) => [r.year, r.amount]));

  // Expected dues (in money) per rated year, up to the current month.
  const expectedForYear = (year: number) => {
    const rate = rateByYear.get(year);
    if (!rate) return 0;
    const months = year < currentYear ? 12 : year === currentYear ? currentMonth : 0;
    return months * rate;
  };
  const totalExpectedPerMember = rates.reduce((s, r) => s + expectedForYear(r.year), 0);

  // Group dues by person.
  const byPerson = new Map<string, { total: number; perYear: Map<number, number>; monthsThisYear: number[] }>();
  for (const d of dues) {
    const entry = byPerson.get(d.personId) ?? { total: 0, perYear: new Map<number, number>(), monthsThisYear: [] as number[] };
    const amt = Number(d.amount);
    entry.total += amt;
    entry.perYear.set(d.year, (entry.perYear.get(d.year) ?? 0) + amt);
    if (d.year === currentYear) entry.monthsThisYear.push(d.month);
    byPerson.set(d.personId, entry);
  }

  const memberRows: WelfareMemberRow[] = members.map((m) => {
    const e = byPerson.get(m.id);
    const paidTotal = e?.total ?? 0;
    // Owed = expected across rated years − what they paid in those years, floored at 0.
    let owed = 0;
    for (const r of rates) {
      const expected = expectedForYear(r.year);
      const paidYear = e?.perYear.get(r.year) ?? 0;
      owed += Math.max(0, expected - paidYear);
    }
    return {
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      hasPhone: !!m.phone,
      monthsPaidThisYear: (e?.monthsThisYear ?? []).sort((a, b) => a - b),
      paidTotal,
      owed,
    };
  });

  const collected = dues.reduce((s, d) => s + Number(d.amount), 0);
  const disbursed = aidRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalOwed = memberRows.reduce((s, m) => s + m.owed, 0);

  void totalExpectedPerMember; // (kept for future per-member expected display)

  return {
    currentYear,
    currentMonth,
    rates,
    members: memberRows,
    aid: aidRows.map((r) => ({
      id: r.id,
      recipientName: r.recipientName,
      type: r.type,
      amount: r.amount ? Number(r.amount) : null,
      description: r.description,
      date: r.date.toISOString(),
      personName: r.person ? `${r.person.firstName} ${r.person.lastName}` : null,
    })),
    collected,
    disbursed,
    totalOwed,
  };
}

/** A short owing summary for one member (used by reminders). */
export async function memberOwedSummary(churchId: string, personId: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [rates, dues, person, church] = await Promise.all([
    db.welfareRate.findMany({ where: { churchId }, select: { year: true, amount: true } }),
    db.welfareDue.findMany({ where: { churchId, personId }, select: { year: true, amount: true } }),
    db.person.findUnique({ where: { id: personId }, select: { firstName: true, phone: true } }),
    db.church.findUnique({ where: { id: churchId }, select: { name: true } }),
  ]);
  const paidByYear = new Map<number, number>();
  for (const d of dues) paidByYear.set(d.year, (paidByYear.get(d.year) ?? 0) + Number(d.amount));
  let owed = 0;
  for (const r of rates) {
    const months = r.year < currentYear ? 12 : r.year === currentYear ? currentMonth : 0;
    owed += Math.max(0, months * Number(r.amount) - (paidByYear.get(r.year) ?? 0));
  }
  return { owed, firstName: person?.firstName ?? "", phone: person?.phone ?? null, churchName: church?.name ?? "your church" };
}
