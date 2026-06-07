import "server-only";
import { db } from "@/lib/db";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Branches ──────────────────────────────────────────────
export async function getBranches(churchId: string) {
  const branches = await db.branch.findMany({ where: { churchId }, orderBy: { isHQ: "desc" } });
  return Promise.all(
    branches.map(async (b) => {
      const [members, giving] = await Promise.all([
        db.person.count({ where: { churchId, branchId: b.id } }),
        db.gift.aggregate({ _sum: { amount: true }, where: { churchId, branchId: b.id } }),
      ]);
      return { id: b.id, name: b.name, city: b.city, isHQ: b.isHQ, members, giving: Number(giving._sum.amount ?? 0) };
    }),
  );
}

// ── Events ────────────────────────────────────────────────
export async function getEvents(churchId: string) {
  const events = await db.event.findMany({
    where: { churchId },
    orderBy: { startsAt: "asc" },
    include: { branch: { select: { name: true } }, _count: { select: { registrations: true } } },
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    date: e.startsAt.toISOString(),
    time: e.startsAt.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }),
    branch: e.branch?.name ?? "All branches",
    capacity: e.capacity ?? 0,
    registered: e._count.registrations,
    paid: e.paid,
    price: e.price ? Number(e.price) : null,
  }));
}

// ── Accounting ────────────────────────────────────────────
export async function getAccounting(churchId: string) {
  const txns = await db.transaction.findMany({ where: { churchId }, orderBy: { date: "desc" }, take: 20 });
  let income = 0;
  let expenses = 0;
  const byFund = new Map<string, number>();
  for (const t of txns) {
    const amt = Number(t.amount);
    if (amt >= 0) income += amt;
    else expenses += Math.abs(amt);
    byFund.set(t.fund ?? "General", (byFund.get(t.fund ?? "General") ?? 0) + amt);
  }
  return {
    transactions: txns.map((t) => ({
      id: t.id,
      description: t.description,
      category: t.category,
      fund: t.fund ?? "General",
      amount: Number(t.amount),
      date: t.date.toISOString(),
    })),
    income,
    expenses,
    fundBalances: [...byFund.entries()].map(([fund, balance]) => ({ fund, balance })),
  };
}

// ── Communications ────────────────────────────────────────
export async function getCommunications(churchId: string) {
  const list = await db.communication.findMany({ where: { churchId }, orderBy: { createdAt: "desc" }, take: 12 });
  const sent = list.reduce((s, c) => s + c.sent, 0);
  const delivered = list.reduce((s, c) => s + c.delivered, 0);
  return {
    campaigns: list.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      sent: c.sent,
      delivered: c.delivered,
      opened: c.opened,
      date: c.createdAt.toISOString(),
      status: c.status.charAt(0).toUpperCase() + c.status.slice(1),
    })),
    stats: { sent, deliveryRate: sent ? Math.round((delivered / sent) * 100) : 0, reach: delivered },
  };
}

// ── Reminders / automations ───────────────────────────────
export async function getReminders(churchId: string) {
  const [automations, people] = await Promise.all([
    db.automation.findMany({ where: { churchId }, orderBy: { name: "asc" } }),
    db.person.findMany({ where: { churchId }, select: { firstName: true, lastName: true, birthday: true, anniversary: true } }),
  ]);

  const now = new Date();
  const upcoming: { person: string; type: string; when: string; sort: number }[] = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const mmdd = `${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : day.toLocaleDateString("en-GH", { weekday: "short" });
    for (const p of people) {
      if (p.birthday === mmdd) upcoming.push({ person: `${p.firstName} ${p.lastName}`, type: "Birthday", when: label, sort: d });
      if (p.anniversary === mmdd) upcoming.push({ person: `${p.firstName} ${p.lastName}`, type: "Anniversary", when: label, sort: d });
    }
  }

  return {
    automations: automations.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      trigger: a.trigger,
      channel: a.channel,
      active: a.active,
      runs: a.runs,
    })),
    upcoming: upcoming.sort((a, b) => a.sort - b.sort).slice(0, 8),
    activeCount: automations.filter((a) => a.active).length,
  };
}

// ── Attendance ────────────────────────────────────────────
export async function getAttendance(churchId: string) {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [records, weekly, branches] = await Promise.all([
    db.attendanceRecord.findMany({ where: { churchId, date: { gte: sixMonthsAgo } }, select: { date: true } }),
    db.attendanceRecord.count({ where: { churchId, date: { gte: weekAgo } } }),
    db.branch.findMany({ where: { churchId }, select: { id: true, name: true, isHQ: true } }),
  ]);

  const buckets: { month: string; attendance: number; amount: number; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTHS[d.getMonth()], attendance: 0, amount: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of records) {
    const i = idx.get(`${r.date.getFullYear()}-${r.date.getMonth()}`);
    if (i !== undefined) buckets[i].attendance += 1;
  }

  const byBranch = await Promise.all(
    branches.map(async (b) => ({
      name: b.name,
      isHQ: b.isHQ,
      present: await db.attendanceRecord.count({ where: { churchId, branchId: b.id, date: { gte: weekAgo } } }),
    })),
  );

  return { weekly, total: records.length, trend: buckets.map((b) => ({ month: b.month, attendance: b.attendance, amount: 0 })), byBranch };
}

// ── Volunteers ────────────────────────────────────────────
export async function getVolunteers(churchId: string) {
  const [teams, assignments] = await Promise.all([
    db.group.findMany({ where: { churchId, type: "ministry" }, include: { _count: { select: { members: true } } } }),
    db.volunteerAssignment.findMany({ where: { churchId }, orderBy: { serviceDate: "asc" }, take: 12 }),
  ]);
  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name, members: t._count.members })),
    assignments: assignments.map((a) => ({
      id: a.id,
      team: a.team,
      role: a.role,
      person: a.personName,
      date: a.serviceDate.toISOString(),
      confirmed: a.confirmed,
    })),
  };
}
