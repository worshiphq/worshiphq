import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReportsClient } from "@/components/app/reports-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Reports" };

function ageBucket(dob: Date, now: Date): string {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  if (age < 0 || age > 120) return "Unknown";
  if (age <= 12) return "Children (0–12)";
  if (age <= 19) return "Teens (13–19)";
  if (age <= 35) return "Young adults (20–35)";
  if (age <= 59) return "Adults (36–59)";
  return "Seniors (60+)";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const session = await requireModule("dashboard");
  const { months: monthsParam } = await searchParams;
  const span = monthsParam === "12" ? 12 : 6;

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (span - 1), 1);

  const [
    totalMembers,
    newMembersThisMonth,
    newMembersLastMonth,
    totalGiftsThisMonth,
    totalGiftsLastMonth,
    monthlyGiving,
    attendanceSessions,
    groupCount,
    visitorCount,
    totalExpensesThisMonth,
    totalExpensesLastMonth,
    monthlyExpenses,
    people,
    funds,
  ] = await Promise.all([
    db.person.count({ where: { churchId: session.churchId } }),
    db.person.count({ where: { churchId: session.churchId, joinedAt: { gte: thisMonth } } }),
    db.person.count({ where: { churchId: session.churchId, joinedAt: { gte: lastMonth, lt: thisMonth } } }),
    db.gift.aggregate({ where: { churchId: session.churchId, date: { gte: thisMonth } }, _sum: { amount: true } }),
    db.gift.aggregate({ where: { churchId: session.churchId, date: { gte: lastMonth, lt: thisMonth } }, _sum: { amount: true } }),
    db.gift.groupBy({ by: ["date"], where: { churchId: session.churchId, date: { gte: rangeStart } }, _sum: { amount: true } }),
    db.attendanceSession.findMany({
      where: { churchId: session.churchId, date: { gte: rangeStart } },
      select: { date: true, adults: true, teens: true, children: true, visitors: true },
      orderBy: { date: "asc" },
    }),
    db.group.count({ where: { churchId: session.churchId } }),
    db.visitor.count({ where: { churchId: session.churchId, createdAt: { gte: thisMonth } } }),
    db.expense.aggregate({ where: { churchId: session.churchId, date: { gte: thisMonth } }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { churchId: session.churchId, date: { gte: lastMonth, lt: thisMonth } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["date"], where: { churchId: session.churchId, date: { gte: rangeStart } }, _sum: { amount: true } }),
    db.person.findMany({ where: { churchId: session.churchId }, select: { joinedAt: true, gender: true, dateOfBirth: true } }),
    db.fund.findMany({
      where: { churchId: session.churchId },
      select: { name: true, gifts: { where: { date: { gte: rangeStart } }, select: { amount: true } } },
    }),
  ]);

  // ── Build the month buckets ──
  const buckets = Array.from({ length: span }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (span - 1 - i), 1);
    const next = new Date(now.getFullYear(), now.getMonth() - (span - 2 - i), 1);
    return { label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), start: d, end: next };
  });

  const givingByMonth = buckets.map((b) => ({
    label: b.label,
    value: monthlyGiving.filter((g) => g.date >= b.start && g.date < b.end).reduce((s, g) => s + Number(g._sum.amount ?? 0), 0),
  }));
  const expensesByMonth = buckets.map((b) => ({
    label: b.label,
    value: monthlyExpenses.filter((e) => e.date >= b.start && e.date < b.end).reduce((s, e) => s + Number(e._sum.amount ?? 0), 0),
  }));
  const attendanceByMonth = buckets.map((b) => {
    const s = attendanceSessions.filter((x) => x.date >= b.start && x.date < b.end);
    const total = s.reduce((sum, x) => sum + x.adults + x.teens + x.children + x.visitors, 0);
    return { label: b.label, value: s.length > 0 ? Math.round(total / s.length) : 0 };
  });

  // Cumulative membership at the end of each month (growth curve).
  const membersByMonth = buckets.map((b) => ({
    label: b.label,
    value: people.filter((p) => p.joinedAt && p.joinedAt < b.end).length,
  }));

  // Attendance breakdown across the range.
  const attTotals = attendanceSessions.reduce(
    (a, s) => ({ adults: a.adults + s.adults, teens: a.teens + s.teens, children: a.children + s.children, visitors: a.visitors + s.visitors }),
    { adults: 0, teens: 0, children: 0, visitors: 0 },
  );
  const attendanceBreakdown = [
    { name: "Adults", count: attTotals.adults },
    { name: "Teens", count: attTotals.teens },
    { name: "Children", count: attTotals.children },
    { name: "Visitors", count: attTotals.visitors },
  ].filter((x) => x.count > 0);

  // Gender split.
  const genderMap = new Map<string, number>();
  for (const p of people) {
    const g = p.gender === "Male" ? "Male" : p.gender === "Female" ? "Female" : "Unspecified";
    genderMap.set(g, (genderMap.get(g) ?? 0) + 1);
  }
  const genderSplit = [...genderMap.entries()].map(([name, count]) => ({ name, count }));

  // Age groups.
  const ageMap = new Map<string, number>();
  for (const p of people) {
    if (!p.dateOfBirth) continue;
    const b = ageBucket(p.dateOfBirth, now);
    if (b === "Unknown") continue;
    ageMap.set(b, (ageMap.get(b) ?? 0) + 1);
  }
  const ageOrder = ["Children (0–12)", "Teens (13–19)", "Young adults (20–35)", "Adults (36–59)", "Seniors (60+)"];
  const ageGroups = ageOrder.filter((k) => ageMap.has(k)).map((k) => ({ name: k, count: ageMap.get(k)! }));

  // Giving by fund (top 6).
  const fundSplit = funds
    .map((f) => ({ name: f.name, value: f.gifts.reduce((s, g) => s + Number(g.amount), 0) }))
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div>
      <PageHeader title="Reports" description="Church growth, giving trends, attendance and people analytics." />

      <ReportsClient
        span={span}
        stats={{
          totalMembers,
          newMembersThisMonth,
          newMembersLastMonth,
          givingThisMonth: Number(totalGiftsThisMonth._sum.amount ?? 0),
          givingLastMonth: Number(totalGiftsLastMonth._sum.amount ?? 0),
          expensesThisMonth: Number(totalExpensesThisMonth._sum.amount ?? 0),
          expensesLastMonth: Number(totalExpensesLastMonth._sum.amount ?? 0),
          groupCount,
          visitorCount,
        }}
        givingByMonth={givingByMonth}
        expensesByMonth={expensesByMonth}
        attendanceByMonth={attendanceByMonth}
        membersByMonth={membersByMonth}
        attendanceBreakdown={attendanceBreakdown}
        genderSplit={genderSplit}
        ageGroups={ageGroups}
        fundSplit={fundSplit}
      />
    </div>
  );
}
