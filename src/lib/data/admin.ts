import { paging } from "@/lib/admin-paging";
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface ChurchRow {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  city: string | null;
  /** Sign-up answer to "How did you hear about WorshipHQ?", with who referred them. */
  heardFrom: string | null;
  suspended: boolean;
  isDemo: boolean;
  plan: string;
  members: number;
  users: number;
  smsCredits: number;
  givingThisMonth: number;
  createdAt: string;
  smsSenderId: string | null;
  smsSenderIdStatus: string;
  smsProvider: string | null;
  smsSenderIdProvider: string | null;
  smsTier: string | null;
}

export type ChurchesPage = { rows: ChurchRow[]; total: number; page: number; pages: number; size: number };

/**
 * One page of the platform's churches (newest first), with headline stats. The search runs across EVERY church, not just
 * the page on screen, and giving is added up for this page's churches only, not for the whole platform.
 */
export async function getChurchesPage(opts: { page?: number; q?: string; size?: number; sort?: string; dir?: string; plan?: string; status?: string } = {}): Promise<ChurchesPage> {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const q = opts.q?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  const and: Prisma.ChurchWhereInput[] = [];
  if (q) and.push({ OR: [
    { name: { contains: q, mode: "insensitive" } },
    { country: { contains: q, mode: "insensitive" } },
    { city: { contains: q, mode: "insensitive" } },
    { slug: { contains: q, mode: "insensitive" } },
    // The owner or an admin, by name, email or phone.
    { users: { some: { OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }] : []),
    ] } } },
  ] });
  if (opts.plan === "free") and.push({ OR: [{ subscription: null }, { subscription: { plan: "free" } }] });
  else if (opts.plan && ["starter", "pro", "max"].includes(opts.plan)) and.push({ subscription: { plan: opts.plan } });
  if (opts.status === "suspended") and.push({ suspended: true });
  else if (opts.status === "active") and.push({ suspended: false });
  const where: Prisma.ChurchWhereInput = and.length ? { AND: and } : {};
  const dir: Prisma.SortOrder = opts.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.ChurchOrderByWithRelationInput[] =
    opts.sort === "name" ? [{ name: dir }]
    : opts.sort === "members" ? [{ people: { _count: dir } }, { createdAt: "desc" }]
    : opts.sort === "team" ? [{ users: { _count: dir } }, { createdAt: "desc" }]
    : opts.sort === "sms" ? [{ smsCredits: dir }, { createdAt: "desc" }]
    : [{ createdAt: dir }];
  const total = await db.church.count({ where });
  const { page, pages, size, skip } = paging(total, opts.page ?? 1, opts.size);

  const churches = await db.church.findMany({
    where,
    skip,
    take: size,
    orderBy,
    select: {
      id: true,
      slug: true,
      name: true,
      country: true,
      city: true,
      suspended: true,
      isDemo: true,
      smsCredits: true,
      smsTier: true,
      smsSenderId: true,
      smsSenderIdStatus: true,
      smsProvider: true,
      smsSenderIdProvider: true,
      createdAt: true,
      heardFrom: true,
      heardFromDetail: true,
      subscription: { select: { plan: true } },
      _count: { select: { people: true, users: true } },
    },
  });

  // Per-church giving this month.
  const giving = await db.gift.groupBy({
    by: ["churchId"],
    where: { churchId: { in: churches.map((c) => c.id) }, date: { gte: startOfMonth } },
    _sum: { amount: true },
  });
  const givingMap = new Map(giving.map((g) => [g.churchId, Number(g._sum.amount ?? 0)]));

  const rows = churches.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    country: c.country,
    city: c.city,
    heardFrom: c.heardFrom ? `${c.heardFrom}${c.heardFromDetail ? `: ${c.heardFromDetail}` : ""}` : null,
    suspended: c.suspended,
    isDemo: c.isDemo,

    smsSenderId: c.smsSenderId,
    smsSenderIdStatus: c.smsSenderIdStatus,
    smsProvider: c.smsProvider,
    smsSenderIdProvider: c.smsSenderIdProvider,

    plan: c.subscription?.plan ?? "free",
    members: c._count.people,
    users: c._count.users,
    smsCredits: c.smsCredits,
    smsTier: c.smsTier,
    givingThisMonth: givingMap.get(c.id) ?? 0,
    createdAt: c.createdAt.toISOString(),
  }));
  return { rows, total, page, pages, size };
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
