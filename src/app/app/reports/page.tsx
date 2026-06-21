import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReportsClient } from "@/components/app/reports-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requireModule("dashboard");

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

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
  ] = await Promise.all([
    db.person.count({ where: { churchId: session.churchId } }),
    db.person.count({ where: { churchId: session.churchId, joinedAt: { gte: thisMonth } } }),
    db.person.count({ where: { churchId: session.churchId, joinedAt: { gte: lastMonth, lt: thisMonth } } }),
    db.gift.aggregate({
      where: { churchId: session.churchId, date: { gte: thisMonth } },
      _sum: { amount: true },
    }),
    db.gift.aggregate({
      where: { churchId: session.churchId, date: { gte: lastMonth, lt: thisMonth } },
      _sum: { amount: true },
    }),
    db.gift.groupBy({
      by: ["date"],
      where: { churchId: session.churchId, date: { gte: sixMonthsAgo } },
      _sum: { amount: true },
    }),
    db.attendanceSession.findMany({
      where: { churchId: session.churchId, date: { gte: sixMonthsAgo } },
      select: { date: true, adults: true, teens: true, children: true, visitors: true },
      orderBy: { date: "asc" },
    }),
    db.group.count({ where: { churchId: session.churchId } }),
    db.visitor.count({ where: { churchId: session.churchId, createdAt: { gte: thisMonth } } }),
  ]);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }));
  }

  const givingByMonth = months.map((label, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const nextD = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
    const total = monthlyGiving
      .filter((g) => g.date >= d && g.date < nextD)
      .reduce((sum, g) => sum + Number(g._sum.amount ?? 0), 0);
    return { label, value: total };
  });

  const attendanceByMonth = months.map((label, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const nextD = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
    const sessions = attendanceSessions.filter((s) => s.date >= d && s.date < nextD);
    const totalAttendees = sessions.reduce((sum, s) => sum + s.adults + s.teens + s.children + s.visitors, 0);
    const avg = sessions.length > 0 ? Math.round(totalAttendees / sessions.length) : 0;
    return { label, value: avg };
  });

  return (
    <div>
      <PageHeader title="Reports" description="Church growth, giving trends, and attendance analytics." />

      <ReportsClient
        stats={{
          totalMembers,
          newMembersThisMonth,
          newMembersLastMonth,
          givingThisMonth: Number(totalGiftsThisMonth._sum.amount ?? 0),
          givingLastMonth: Number(totalGiftsLastMonth._sum.amount ?? 0),
          groupCount,
          visitorCount,
        }}
        givingByMonth={givingByMonth}
        attendanceByMonth={attendanceByMonth}
      />
    </div>
  );
}
