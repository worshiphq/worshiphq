import { db } from "@/lib/db";

export type AppNotification = {
  id: string;
  text: string;
  time: string;
  type: "member" | "visitor" | "gift" | "attendance" | "prayer";
};

export async function getRecentNotifications(churchId: string): Promise<AppNotification[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [newMembers, newVisitors, recentGifts, recentSessions, newPrayers] = await Promise.all([
    db.person.findMany({
      where: { churchId, joinedAt: { gte: since } },
      select: { id: true, firstName: true, lastName: true, joinedAt: true },
      orderBy: { joinedAt: "desc" },
      take: 10,
    }),
    db.visitor.findMany({
      where: { churchId, createdAt: { gte: since } },
      select: { id: true, firstName: true, lastName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.gift.findMany({
      where: { churchId, date: { gte: since } },
      select: { id: true, amount: true, method: true, date: true },
      orderBy: { date: "desc" },
      take: 10,
    }),
    db.attendanceSession.findMany({
      where: { churchId, date: { gte: since } },
      select: { id: true, serviceName: true, date: true, adults: true, teens: true, children: true, visitors: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
    db.prayerRequest.findMany({
      where: { churchId, createdAt: { gte: since } },
      select: { id: true, name: true, isAnonymous: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const notifs: AppNotification[] = [];

  for (const m of newMembers) {
    notifs.push({
      id: `member-${m.id}`,
      text: `${m.firstName} ${m.lastName} registered as a new member`,
      time: m.joinedAt.toISOString(),
      type: "member",
    });
  }

  for (const v of newVisitors) {
    notifs.push({
      id: `visitor-${v.id}`,
      text: `${v.firstName} ${v.lastName} submitted a visitor form`,
      time: v.createdAt.toISOString(),
      type: "visitor",
    });
  }

  for (const g of recentGifts) {
    const amt = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(g.amount));
    notifs.push({
      id: `gift-${g.id}`,
      text: `${amt} ${g.method ?? "gift"} received`,
      time: g.date.toISOString(),
      type: "gift",
    });
  }

  for (const s of recentSessions) {
    const total = s.adults + s.teens + s.children + s.visitors;
    notifs.push({
      id: `session-${s.id}`,
      text: `${s.serviceName}: ${total} attendee${total !== 1 ? "s" : ""} recorded`,
      time: s.date.toISOString(),
      type: "attendance",
    });
  }

  for (const p of newPrayers) {
    notifs.push({
      id: `prayer-${p.id}`,
      text: `${p.isAnonymous ? "Anonymous" : p.name} submitted a prayer request`,
      time: p.createdAt.toISOString(),
      type: "prayer",
    });
  }

  notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return notifs.slice(0, 20);
}
