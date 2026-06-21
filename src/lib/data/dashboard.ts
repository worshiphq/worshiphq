import "server-only";
import { db } from "@/lib/db";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getDashboard(churchId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const todayMMDD = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [activeMembers, weekAgg, monthGiving, reachAgg, gifts, attendance, events, people, departments, recent, featuredLeaders] =
    await Promise.all([
      db.person.count({ where: { churchId, status: "active" } }),
      db.attendanceSession.aggregate({
        _sum: { adults: true, teens: true, children: true, visitors: true },
        where: { churchId, date: { gte: weekAgo } },
      }),
      db.gift.aggregate({ _sum: { amount: true }, where: { churchId, date: { gte: startOfMonth } } }),
      db.communication.aggregate({ _sum: { delivered: true }, where: { churchId } }),
      db.gift.findMany({ where: { churchId, date: { gte: sixMonthsAgo } }, select: { amount: true, date: true } }),
      db.attendanceSession.findMany({ where: { churchId, date: { gte: sixMonthsAgo } }, select: { date: true, adults: true, teens: true, children: true, visitors: true } }),
      db.event.findMany({ where: { churchId, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 4 }),
      db.person.findMany({ where: { churchId }, select: { firstName: true, lastName: true, birthday: true, status: true, gender: true, photoUrl: true, departmentId: true } }),
      db.department.findMany({ where: { churchId }, select: { id: true, name: true, _count: { select: { members: true } } } }),
      db.person.findMany({ where: { churchId }, orderBy: { joinedAt: "desc" }, take: 6, select: { firstName: true, lastName: true, gender: true, status: true, joinedAt: true, photoUrl: true, departments: { select: { name: true }, take: 1 } } }),
      db.person.findMany({ where: { churchId, featured: true, leaderTitle: { not: null } }, orderBy: { joinedAt: "asc" }, take: 5, select: { firstName: true, lastName: true, title: true, leaderTitle: true, photoUrl: true, phone: true, email: true } }),
    ]);

  // 6-month trend buckets
  const buckets: { key: string; month: string; amount: number; attendance: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTHS[d.getMonth()], amount: 0, attendance: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const g of gifts) {
    const k = `${g.date.getFullYear()}-${g.date.getMonth()}`;
    const i = idx.get(k);
    if (i !== undefined) buckets[i].amount += Number(g.amount);
  }
  for (const a of attendance) {
    const k = `${a.date.getFullYear()}-${a.date.getMonth()}`;
    const i = idx.get(k);
    if (i !== undefined) buckets[i].attendance += a.adults + a.teens + a.children + a.visitors;
  }

  const todaysBirthdays = people
    .filter((p) => p.birthday === todayMMDD)
    .slice(0, 5)
    .map((p) => ({ name: `${p.firstName} ${p.lastName}`, gender: p.gender, photoUrl: p.photoUrl }));

  const careTasks = people
    .filter((p) => p.status === "visitor" || p.status === "inactive")
    .slice(0, 5)
    .map((p, i) => ({
      id: String(i),
      person: `${p.firstName} ${p.lastName}`,
      reason: p.status === "visitor" ? "First-time visitor — welcome & connect" : "Hasn't attended recently — check in",
      due: i === 0 ? "Today" : i === 1 ? "Today" : "This week",
      priority: (p.status === "visitor" ? "high" : "medium") as "high" | "medium" | "low",
    }));

  const departmentBreakdown = departments.map((d) => ({ name: d.name, count: d._count.members }));

  const recentMembers = recent.map((p) => ({
    name: `${p.firstName} ${p.lastName}`,
    gender: p.gender,
    photoUrl: p.photoUrl,
    department: p.departments[0]?.name ?? null,
    status: p.status,
    joined: p.joinedAt.toLocaleDateString("en-GH", { month: "short", day: "numeric" }),
  }));

  const leaders = featuredLeaders.map((l) => ({
    name: `${l.title ? l.title + " " : ""}${l.firstName} ${l.lastName}`,
    leaderTitle: l.leaderTitle!,
    photoUrl: l.photoUrl,
    phone: l.phone,
    email: l.email,
  }));

  return {
    leaders,
    kpis: {
      activeMembers,
      weeklyAttendance:
        (weekAgg._sum.adults ?? 0) +
        (weekAgg._sum.teens ?? 0) +
        (weekAgg._sum.children ?? 0) +
        (weekAgg._sum.visitors ?? 0),
      monthlyGiving: Number(monthGiving._sum.amount ?? 0),
      messageReach: reachAgg._sum.delivered ?? 0,
    },
    trend: buckets.map((b) => ({ month: b.month, amount: b.amount, attendance: b.attendance })),
    todaysBirthdays,
    events: events.map((e) => ({ id: e.id, title: e.title, date: e.startsAt.toISOString(), branch: "", time: e.startsAt.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) })),
    careTasks,
    recentMembers,
    departmentBreakdown,
  };
}
