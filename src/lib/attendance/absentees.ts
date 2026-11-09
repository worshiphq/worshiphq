import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const ABSENTEE_PAGE = 25;
/** "Regular" = came to at least one service in this many days before this one. */
export const REGULAR_DAYS = 56;

export type AbsenteeFilters = {
  q?: string;
  /** "departments", "groups" or a member-category id; with groupId, narrows to that one group. */
  grouping?: string;
  groupId?: string;
  /** Only people who came at least once in the last 8 weeks (default on). */
  regularsOnly?: boolean;
};

export type AbsenteeRow = {
  id: string;
  name: string;
  phone: string | null;
  lastSeen: string | null;
  groups: string[];
};

/**
 * Who should have been at this service but did not check in: active members (not children), in the service's branch,
 * with no open follow-up already. By default only regulars, so long-gone or never-seen names don't flood the list.
 */
async function absenteeWhere(churchId: string, sessionId: string, f: AbsenteeFilters) {
  const sess = await db.attendanceSession.findFirst({ where: { id: sessionId, churchId }, select: { id: true, date: true, branchId: true, serviceName: true } });
  if (!sess) return null;
  const since = new Date(sess.date.getTime() - REGULAR_DAYS * 86400000);
  const and: Prisma.PersonWhereInput[] = [
    { churchId, status: "active" },
    { OR: [{ ageGroup: null }, { ageGroup: { not: "child" } }] },
    { attendance: { none: { sessionId: sess.id } } },
    { followUps: { none: { status: { not: "done" } } } },
  ];
  if (sess.branchId) and.push({ OR: [{ branchId: sess.branchId }, { branchId: null }] });
  if (f.regularsOnly !== false) and.push({ attendance: { some: { date: { gte: since, lt: sess.date }, NOT: { sessionId: sess.id } } } });
  const q = f.q?.trim();
  if (q) {
    for (const word of q.split(/\s+/).slice(0, 3)) {
      and.push({ OR: [{ firstName: { contains: word, mode: "insensitive" } }, { lastName: { contains: word, mode: "insensitive" } }, { phone: { contains: word } }] });
    }
  }
  if (f.grouping && f.groupId) {
    if (f.grouping === "departments") and.push({ OR: [{ departmentId: f.groupId }, { departments: { some: { id: f.groupId } } }] });
    else if (f.grouping === "groups") and.push({ groups: { some: { id: f.groupId } } });
    else and.push({ categoryOptions: { some: { id: f.groupId } } });
  }
  return { sess, where: { AND: and } as Prisma.PersonWhereInput };
}

export async function listAbsentees(churchId: string, sessionId: string, f: AbsenteeFilters, page = 1) {
  const w = await absenteeWhere(churchId, sessionId, f);
  if (!w) return null;
  const [total, people, all] = await Promise.all([
    db.person.count({ where: w.where }),
    db.person.findMany({
      where: w.where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (Math.max(1, page) - 1) * ABSENTEE_PAGE,
      take: ABSENTEE_PAGE,
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        department: { select: { name: true } }, departments: { select: { name: true } }, groups: { select: { name: true } },
        attendance: { where: { NOT: { sessionId: w.sess.id } }, orderBy: { date: "desc" }, take: 1, select: { date: true } },
      },
    }),
    db.person.findMany({ where: w.where, select: { id: true }, take: 2000 }),
  ]);
  const rows: AbsenteeRow[] = people.map((p) => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`.trim(),
    phone: p.phone,
    lastSeen: p.attendance[0]?.date.toISOString() ?? null,
    groups: [...new Set([p.department?.name, ...p.departments.map((d) => d.name), ...p.groups.map((g) => g.name)].filter(Boolean) as string[])].slice(0, 3),
  }));
  return { rows, total, allIds: all.map((a) => a.id), service: w.sess.serviceName, date: w.sess.date.toISOString() };
}

/** Re-check a chosen list against the same rules on the server (so a stale page can't add someone who came). */
export async function confirmAbsentees(churchId: string, sessionId: string, ids: string[]) {
  const w = await absenteeWhere(churchId, sessionId, { regularsOnly: false });
  if (!w) return null;
  const people = await db.person.findMany({ where: { AND: [w.where, { id: { in: ids } }] }, select: { id: true, firstName: true, lastName: true, phone: true } });
  return { sess: w.sess, people };
}

/** The ways the church groups people, with their groups, for the filter. */
export async function absenteeGroupings(churchId: string) {
  const [departments, groups, categories] = await Promise.all([
    db.department.findMany({ where: { churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.group.findMany({ where: { churchId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.memberCategory.findMany({
      where: { churchId, options: { some: {} } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } } },
    }),
  ]);
  return [
    ...(departments.length ? [{ key: "departments", label: "Department", groups: departments }] : []),
    ...(groups.length ? [{ key: "groups", label: "Group", groups }] : []),
    ...categories.map((c) => ({ key: c.id, label: c.name, groups: c.options })),
  ];
}
