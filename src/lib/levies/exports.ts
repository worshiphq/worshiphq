import "server-only";
import { db } from "@/lib/db";
import { ymdInTz } from "@/lib/time/tz";
import { safeTz, type Breakdown } from "@/lib/levies/engine";
import { METHOD_LABELS } from "@/lib/levies/explain";
import { toCents, centsToNumber } from "@/lib/levies/money";
import { dayStart, periodLabel } from "@/lib/levies/periods";
import { statusOf } from "@/lib/levies/calc";
import { statusText } from "@/lib/levies/explain";
import type { Frequency } from "@/lib/levies/types";

const asFreq = (f: string): Frequency => (f === "quarterly" || f === "yearly" ? f : "monthly");
const n2 = (d: { toString(): string }) => centsToNumber(toCents(d.toString()));

async function tzOf(churchId: string) {
  const c = await db.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  return safeTz(c?.timezone);
}

/** Every levy period: what was due, paid and left, with how it was worked out. */
export async function levyRecordsTable(churchId: string) {
  const tz = await tzOf(churchId);
  const today = ymdInTz(new Date(), tz);
  const rows = await db.levyRecord.findMany({ where: { churchId }, orderBy: [{ periodStart: "desc" }], include: { rule: { select: { name: true, payee: true, frequency: true, yearStartMonth: true } } } });
  return {
    headers: ["Levy", "Paid to", "Period", "Income counted", "Worked out", "Adjustments", "Due", "Paid", "Left", "Due date", "Status", "Closed", "How it was worked out"],
    rows: rows.map((r) => {
      const s = statusOf({ todayYmd: today, endYmd: ymdInTz(r.periodEnd, tz), dueYmd: ymdInTz(r.dueDate, tz), dueCents: toCents(r.amountDue.toString()), paidCents: toCents(r.amountPaid.toString()) });
      const bd = r.breakdown as Breakdown | null;
      return [
        r.rule.name, r.rule.payee, periodLabel(r.periodKey, asFreq(r.rule.frequency), r.rule.yearStartMonth),
        n2(r.incomeBase), n2(r.calculated), n2(r.adjustments), n2(r.amountDue), n2(r.amountPaid), centsToNumber(s.leftCents),
        ymdInTz(r.dueDate, tz), statusText(s.status, { dueYmd: ymdInTz(r.dueDate, tz), partPaid: s.partPaid }), r.state === "closed" ? "Yes" : "No",
        [...(bd?.lines ?? []).map((l) => l.text), ...(bd?.cap ? [bd.cap] : [])].join("; "),
      ];
    }),
  };
}

export async function levyPaymentsTable(churchId: string) {
  const tz = await tzOf(churchId);
  const rows = await db.levyPayment.findMany({
    where: { churchId }, orderBy: { paidOn: "desc" },
    include: { record: { select: { periodKey: true, rule: { select: { name: true, payee: true, frequency: true, yearStartMonth: true } } } }, account: { select: { name: true } } },
  });
  return {
    headers: ["Date paid", "Levy", "Paid to", "Period", "Amount", "How", "Reference", "From account", "Recorded as expense", "Receipt attached", "Confirmed by receiver", "Recorded by", "Note"],
    rows: rows.map((p) => [
      ymdInTz(p.paidOn, tz), p.record.rule.name, p.record.rule.payee, periodLabel(p.record.periodKey, asFreq(p.record.rule.frequency), p.record.rule.yearStartMonth),
      n2(p.amount), METHOD_LABELS[p.method] ?? p.method, p.reference ?? "", p.account?.name ?? "", p.expenseId ? "Yes" : "No", p.proofKey ? "Yes" : "No",
      p.parentConfirmedAt ? `${p.parentConfirmedByName ?? "Yes"} (${ymdInTz(p.parentConfirmedAt, tz)})` : "", p.recordedByName ?? "", p.note ?? "",
    ]),
  };
}

export async function serviceIncomeTable(churchId: string) {
  const tz = await tzOf(churchId);
  const rows = await db.serviceIncome.findMany({
    where: { churchId }, orderBy: { date: "desc" },
    include: { gifts: { select: { amount: true, fund: { select: { name: true } } } }, session: { select: { adults: true, teens: true, children: true, visitors: true } } },
  });
  const funds = [...new Set(rows.flatMap((r) => r.gifts.map((g) => g.fund?.name ?? "General giving")))].sort();
  return {
    headers: ["Date", "Service", ...funds, "Total", "Attendance", "Per person", "Counted by", "Note"],
    rows: rows.map((r) => {
      const by = funds.map((f) => Math.round(r.gifts.filter((g) => (g.fund?.name ?? "General giving") === f).reduce((t, g) => t + Number(g.amount), 0) * 100) / 100);
      const total = Math.round(by.reduce((a, b) => a + b, 0) * 100) / 100;
      const sessionCount = r.session ? r.session.adults + r.session.teens + r.session.children + r.session.visitors : 0;
      const att = sessionCount || r.headcount || 0;
      return [ymdInTz(r.date, tz), r.serviceName, ...by, total, att || "", att ? Math.round((total / att) * 100) / 100 : "", r.countedBy ?? "", r.note ?? ""];
    }),
  };
}

/* ───────── Remittance statement ───────── */

export interface StatementData {
  churchName: string;
  logoUrl: string | null;
  payee: string | null;
  rangeLabel: string;
  preparedOn: string;
  groups: {
    ruleName: string;
    payee: string;
    periods: { label: string; lines: string[]; due: number; paid: number; left: number; status: string; payments: { date: string; amount: number; method: string; reference: string | null }[] }[];
    due: number; paid: number; left: number;
  }[];
  totals: { due: number; paid: number; left: number };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Every levy period that starts within the months chosen, grouped by levy, for the remittance statement. */
export async function statementData(churchId: string, opts: { fromYm: string; toYm: string; payee?: string | null }): Promise<StatementData> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true, logoUrl: true, timezone: true } });
  const tz = safeTz(church?.timezone);
  const today = ymdInTz(new Date(), tz);
  const [ty, tm] = opts.toYm.split("-").map(Number);
  const endYmd = tm === 12 ? `${ty + 1}-01-01` : `${ty}-${String(tm + 1).padStart(2, "0")}-01`;
  const recs = await db.levyRecord.findMany({
    where: {
      churchId, periodStart: { gte: dayStart(`${opts.fromYm}-01`, tz), lt: dayStart(endYmd, tz) },
      ...(opts.payee ? { rule: { payee: opts.payee } } : {}),
    },
    orderBy: [{ periodStart: "asc" }],
    include: { rule: { select: { id: true, name: true, payee: true, frequency: true, yearStartMonth: true, sortOrder: true } }, payments: { orderBy: { paidOn: "asc" } } },
  });
  const groups = new Map<string, StatementData["groups"][number] & { sort: number }>();
  for (const r of recs) {
    const g = groups.get(r.rule.id) ?? { ruleName: r.rule.name, payee: r.rule.payee, periods: [], due: 0, paid: 0, left: 0, sort: r.rule.sortOrder };
    const s = statusOf({ todayYmd: today, endYmd: ymdInTz(r.periodEnd, tz), dueYmd: ymdInTz(r.dueDate, tz), dueCents: toCents(r.amountDue.toString()), paidCents: toCents(r.amountPaid.toString()) });
    const bd = r.breakdown as Breakdown | null;
    const due = n2(r.amountDue), paid = n2(r.amountPaid), left = centsToNumber(s.leftCents);
    g.periods.push({
      label: periodLabel(r.periodKey, asFreq(r.rule.frequency), r.rule.yearStartMonth),
      lines: [...(bd?.lines ?? []).map((l) => l.text), ...(bd?.cap ? [bd.cap] : []), ...(n2(r.adjustments) ? [`Adjustments: ${n2(r.adjustments).toFixed(2)}`] : [])],
      due, paid, left, status: statusText(s.status, { dueYmd: ymdInTz(r.dueDate, tz), partPaid: s.partPaid }),
      payments: r.payments.map((p) => ({ date: ymdInTz(p.paidOn, tz), amount: n2(p.amount), method: METHOD_LABELS[p.method] ?? p.method, reference: p.reference })),
    });
    g.due += due; g.paid += paid; g.left += left;
    groups.set(r.rule.id, g);
  }
  const list = [...groups.values()].sort((a, b) => a.sort - b.sort).map(({ sort: _s, ...g }) => ({ ...g, due: Math.round(g.due * 100) / 100, paid: Math.round(g.paid * 100) / 100, left: Math.round(g.left * 100) / 100 }));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    churchName: church?.name ?? "Church", logoUrl: church?.logoUrl ?? null, payee: opts.payee ?? null,
    rangeLabel: opts.fromYm === opts.toYm ? ymLabel(opts.fromYm) : `${ymLabel(opts.fromYm)} to ${ymLabel(opts.toYm)}`,
    preparedOn: today,
    groups: list,
    totals: { due: r2(list.reduce((t, g) => t + g.due, 0)), paid: r2(list.reduce((t, g) => t + g.paid, 0)), left: r2(list.reduce((t, g) => t + g.left, 0)) },
  };
}
