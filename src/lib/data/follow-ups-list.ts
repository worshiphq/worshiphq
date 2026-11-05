import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const FOLLOWUP_PAGE = 15;

export type FollowUpFilter = "active" | "mine" | "overdue" | "done" | "all";

export interface FollowUpFilters {
  filter: FollowUpFilter;
  sort: "due" | "newest" | "oldest" | "name" | "completed";
  type: string; // "all" or a kind
  who: string; // "all", "none" or a user id
  dateBy: "due" | "created" | "completed";
  from: string; // yyyy-mm-dd or ""
  to: string;
  /** Local midnight of the viewer's today, in ms, so "overdue" means what they see on their calendar. */
  todayMs: number;
}

const INCLUDE = {
  person: { select: { firstName: true, lastName: true, phone: true } },
  visitor: { select: { firstName: true, lastName: true, phone: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
  reports: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, method: true, outcome: true, note: true, authorId: true, authorName: true, createdAt: true },
  },
} satisfies Prisma.FollowUpInclude;

/** Everything still open, plus what was finished in the last 60 days (older finished tasks are not listed). */
function baseWhere(churchId: string): Prisma.FollowUpWhereInput {
  const since = new Date(Date.now() - 60 * 86400000);
  return { churchId, OR: [{ status: { not: "done" } }, { status: "done", completedAt: { gte: since } }] };
}

export async function queryFollowUps(churchId: string, me: string, search: string, f: FollowUpFilters, pageWanted: number) {
  const and: Prisma.FollowUpWhereInput[] = [baseWhere(churchId)];
  const today = new Date(f.todayMs);

  if (f.filter === "active") and.push({ status: { not: "done" } });
  else if (f.filter === "done") and.push({ status: "done" });
  else if (f.filter === "mine") and.push({ status: { not: "done" }, assignees: { some: { userId: me } } });
  else if (f.filter === "overdue") and.push({ status: { not: "done" }, dueDate: { lt: today } });

  if (f.type && f.type !== "all") and.push({ type: f.type });
  if (f.who === "none") and.push({ assignees: { none: {} } });
  else if (f.who && f.who !== "all") and.push({ assignees: { some: { userId: f.who } } });

  if (f.from || f.to) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (f.from) range.gte = new Date(`${f.from}T00:00:00`);
    if (f.to) range.lte = new Date(`${f.to}T23:59:59`);
    const col = f.dateBy === "created" ? "createdAt" : f.dateBy === "completed" ? "completedAt" : "dueDate";
    and.push({ [col]: range } as Prisma.FollowUpWhereInput);
  }

  for (const w of search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6)) {
    const has = { contains: w, mode: "insensitive" as const };
    and.push({
      OR: [
        { title: has },
        { person: { is: { OR: [{ firstName: has }, { lastName: has }] } } },
        { visitor: { is: { OR: [{ firstName: has }, { lastName: has }] } } },
        { assignees: { some: { user: { name: has } } } },
      ],
    });
  }

  // "name" orders by the follow-up's title (which carries the person's name for visitor and member follow-ups).
  const orderBy: Prisma.FollowUpOrderByWithRelationInput[] =
    f.sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }]
      : f.sort === "oldest" ? [{ createdAt: "asc" }, { id: "asc" }]
        : f.sort === "name" ? [{ title: "asc" }, { id: "asc" }]
          : f.sort === "completed" ? [{ completedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }]
            : [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }];

  const where: Prisma.FollowUpWhereInput = { AND: and };
  const total = await db.followUp.count({ where });
  const pages = Math.max(1, Math.ceil(total / FOLLOWUP_PAGE));
  const page = Math.min(Math.max(1, Math.floor(pageWanted || 1)), pages);
  const items = await db.followUp.findMany({ where, orderBy, skip: (page - 1) * FOLLOWUP_PAGE, take: FOLLOWUP_PAGE, include: INCLUDE });

  const rows = items.map((x) => ({
    id: x.id,
    title: x.title,
    type: x.type,
    note: x.note,
    status: x.status,
    dueDate: x.dueDate?.toISOString() ?? null,
    completedAt: x.completedAt?.toISOString() ?? null,
    createdAt: x.createdAt.toISOString(),
    personName: x.person ? `${x.person.firstName} ${x.person.lastName}` : null,
    visitorName: x.visitor ? `${x.visitor.firstName} ${x.visitor.lastName}` : null,
    phone: x.visitor?.phone ?? x.person?.phone ?? null,
    assignees: x.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
    reports: x.reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }));
  return { rows, total, page };
}

/** The numbers on the filter buttons. */
export async function followUpCounts(churchId: string, me: string, todayMs: number) {
  const base = baseWhere(churchId);
  const open = { status: { not: "done" } } satisfies Prisma.FollowUpWhereInput;
  const [active, mine, overdue, done, all] = await Promise.all([
    db.followUp.count({ where: { AND: [base, open] } }),
    db.followUp.count({ where: { AND: [base, open, { assignees: { some: { userId: me } } }] } }),
    db.followUp.count({ where: { AND: [base, open, { dueDate: { lt: new Date(todayMs) } }] } }),
    db.followUp.count({ where: { AND: [base, { status: "done" }] } }),
    db.followUp.count({ where: base }),
  ]);
  return { active, mine, overdue, done, all };
}
