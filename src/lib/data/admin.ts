import "server-only";
import { db } from "@/lib/db";

export interface ChurchRow {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  city: string | null;
  suspended: boolean;
  isDemo: boolean;
  plan: string;
  members: number;
  users: number;
  smsCredits: number;
  givingThisMonth: number;
  createdAt: string;
}

/** Every church on the platform, with headline stats (newest first). */
export async function getAllChurches(): Promise<ChurchRow[]> {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const churches = await db.church.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      country: true,
      city: true,
      suspended: true,
      isDemo: true,
      smsCredits: true,
      createdAt: true,
      subscription: { select: { plan: true } },
      _count: { select: { people: true, users: true } },
    },
  });

  // Per-church giving this month.
  const giving = await db.gift.groupBy({
    by: ["churchId"],
    where: { date: { gte: startOfMonth } },
    _sum: { amount: true },
  });
  const givingMap = new Map(giving.map((g) => [g.churchId, Number(g._sum.amount ?? 0)]));

  return churches.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    country: c.country,
    city: c.city,
    suspended: c.suspended,
    isDemo: c.isDemo,
    plan: c.subscription?.plan ?? "free",
    members: c._count.people,
    users: c._count.users,
    smsCredits: c.smsCredits,
    givingThisMonth: givingMap.get(c.id) ?? 0,
    createdAt: c.createdAt.toISOString(),
  }));
}

export interface PlatformStats {
  churches: number;
  activeChurches: number;
  members: number;
  users: number;
  givingThisMonth: number;
  signupsThisMonth: number;
  trend: { month: string; churches: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Platform-wide totals across every church. */
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [churches, activeChurches, members, users, givingAgg, signups, churchDates] =
    await Promise.all([
      db.church.count({ where: { isDemo: false } }),
      db.church.count({ where: { isDemo: false, suspended: false } }),
      db.person.count(),
      db.user.count(),
      db.gift.aggregate({ _sum: { amount: true }, where: { date: { gte: startOfMonth } } }),
      db.church.count({ where: { isDemo: false, createdAt: { gte: startOfMonth } } }),
      db.church.findMany({
        where: { isDemo: false, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
    ]);

  const buckets: { key: string; month: string; churches: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTHS[d.getMonth()], churches: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const c of churchDates) {
    const i = idx.get(`${c.createdAt.getFullYear()}-${c.createdAt.getMonth()}`);
    if (i !== undefined) buckets[i].churches += 1;
  }

  return {
    churches,
    activeChurches,
    members,
    users,
    givingThisMonth: Number(givingAgg._sum.amount ?? 0),
    signupsThisMonth: signups,
    trend: buckets.map((b) => ({ month: b.month, churches: b.churches })),
  };
}
