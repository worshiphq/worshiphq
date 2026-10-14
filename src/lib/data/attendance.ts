import "server-only";
import { db } from "@/lib/db";
import { can, granted } from "@/lib/permissions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type AttendanceCategory = "adult" | "teen" | "child" | "visitor";

/** Derive an attendance category from a person's DOB/birthday + status. */
export function categoryForPerson(
  p: { status?: string | null; dateOfBirth?: Date | null; birthday?: string | null; ageGroup?: string | null },
  cfg: { childMax: number; teenMax: number } = { childMax: 12, teenMax: 17 },
): AttendanceCategory {
  if (p.status === "visitor") return "visitor";
  // Someone already filed as a child or teen counts as one, even without a date of birth.
  if (p.ageGroup === "child" || p.ageGroup === "teen") return p.ageGroup;
  const age = ageFrom(p.dateOfBirth ?? null);
  if (age === null) return "adult";
  if (age <= cfg.childMax) return "child";
  if (age <= cfg.teenMax) return "teen";
  return "adult";
}

function ageFrom(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function sessionTotal(s: { adults: number; teens: number; children: number; visitors: number }): number {
  return s.adults + s.teens + s.children + s.visitors;
}

export interface SessionRow {
  id: string;
  serviceName: string;
  date: string; // ISO
  branch: string | null;
  adults: number;
  teens: number;
  children: number;
  visitors: number;
  total: number;
  named: number; // identified attendees
}

export async function getAttendanceOverview(churchId: string) {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sessions, branches] = await Promise.all([
    db.attendanceSession.findMany({
      where: { churchId, date: { gte: sixMonthsAgo } },
      orderBy: { date: "desc" },
      include: {
        branch: { select: { name: true } },
        _count: { select: { records: true } },
      },
    }),
    db.branch.findMany({ where: { churchId }, select: { id: true, name: true, isHQ: true } }),
  ]);

  const rows: SessionRow[] = sessions.map((s) => ({
    id: s.id,
    serviceName: s.serviceName,
    date: s.date.toISOString(),
    branch: s.branch?.name ?? null,
    adults: s.adults,
    teens: s.teens,
    children: s.children,
    visitors: s.visitors,
    total: sessionTotal(s),
    named: s._count.records,
  }));

  // 6-month trend (sum of session totals per month).
  const buckets: { key: string; month: string; attendance: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTHS[d.getMonth()], attendance: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of sessions) {
    const d = new Date(s.date);
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i !== undefined) buckets[i].attendance += sessionTotal(s);
  }

  const thisWeek = rows.filter((r) => new Date(r.date) >= weekAgo).reduce((a, r) => a + r.total, 0);
  const thisMonth = rows.filter((r) => new Date(r.date) >= startOfMonth).reduce((a, r) => a + r.total, 0);
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.total, 0) / rows.length) : 0;

  return {
    kpis: { thisWeek, thisMonth, sessions: rows.length, avg },
    trend: buckets.map((b) => ({ month: b.month, attendance: b.attendance })),
    mostRecent: rows[0] ?? null,
    history: rows,
    branches,
  };
}

export async function getAttendanceSession(churchId: string, id: string) {
  const session = await db.attendanceSession.findFirst({
    where: { id, churchId },
    include: {
      branch: { select: { name: true } },
      records: {
        orderBy: { date: "desc" },
        include: {
          person: {
            select: {
              firstName: true, lastName: true, gender: true, photoUrl: true,
              departments: { select: { name: true } },
              department: { select: { name: true } },
              categoryOptions: { select: { name: true, categoryId: true } },
              groups: { where: { isActive: true }, select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!session) return null;

  const total = sessionTotal(session);
  const breakdown = [
    { name: "Adults", key: "adult", count: session.adults },
    { name: "Teens", key: "teen", count: session.teens },
    { name: "Children", key: "child", count: session.children },
    { name: "Visitors", key: "visitor", count: session.visitors },
  ];

  const attendees = session.records.map((r) => ({
    id: r.id,
    name: r.person ? `${r.person.firstName} ${r.person.lastName}` : r.guestName ?? "Guest",
    gender: r.person?.gender ?? null,
    photoUrl: r.person?.photoUrl ?? null,
    category: r.category,
    method: r.method,
    time: r.date.toISOString(),
    groups: r.person ? personGroups(r.person) : {},
  }));

  return {
    id: session.id,
    serviceName: session.serviceName,
    date: session.date.toISOString(),
    branch: session.branch?.name ?? null,
    note: session.note,
    counts: { adults: session.adults, teens: session.teens, children: session.children, visitors: session.visitors },
    total,
    breakdown,
    attendees,
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    reportSentTo: session.reportSentTo,
  };
}

/** Saved end-of-service report defaults + how many recipients each option reaches. */
export async function getAttendanceReportConfig(churchId: string) {
  const [church, users] = await Promise.all([
    db.church.findUnique({
      where: { id: churchId },
      select: {
        name: true,
        attendanceReportTemplate: true,
        attendanceReportNumbers: true,
        attendanceReportToAdmins: true,
        attendanceReportToLeaders: true,
      },
    }),
    db.user.findMany({
      where: { churchId, phone: { not: null } },
      select: { role: true, customRole: { select: { sections: true } } },
    }),
  ]);

  let admins = 0;
  let leaders = 0;
  for (const u of users) {
    if (u.role === "Owner" || u.role === "Admin") admins++;
    const seesAttendance = u.customRole
      ? granted(u.customRole.sections, "attendance", true)
      : can(u.role, "attendance");
    if (seesAttendance) leaders++;
  }

  return {
    churchName: church?.name ?? "Church",
    template: church?.attendanceReportTemplate ?? null,
    numbers: church?.attendanceReportNumbers ?? "",
    toAdmins: church?.attendanceReportToAdmins ?? true,
    toLeaders: church?.attendanceReportToLeaders ?? false,
    adminCount: admins,
    leaderCount: leaders,
  };
}

/** Members not yet checked in to this session - for the staff check-in picker. */
export async function getCheckInCandidates(churchId: string, sessionId: string) {
  const [people, records] = await Promise.all([
    db.person.findMany({
      where: { churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true, firstName: true, lastName: true, gender: true, status: true, photoUrl: true, phone: true, memberId: true,
        departments: { select: { name: true } },
        department: { select: { name: true } },
        categoryOptions: { select: { name: true, categoryId: true } },
        groups: { where: { isActive: true }, select: { name: true } },
      },
    }),
    db.attendanceRecord.findMany({ where: { sessionId }, select: { personId: true } }),
  ]);
  const checkedIn = new Set(records.map((r) => r.personId).filter(Boolean));
  // Everyone stays searchable - already-checked-in people are flagged rather
  // than hidden, so searching a name never comes back empty and it's obvious
  // they're already in (prevents confused double check-in attempts).
  return people.map((p) => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    phone: p.phone,
    memberId: p.memberId,
    gender: p.gender,
    photoUrl: p.photoUrl,
    status: p.status,
    checkedIn: checkedIn.has(p.id),
    groups: personGroups(p),
  }));
}

/** A person's departments: the many-to-many list plus the older single link. */
function departmentNames(p: { departments: { name: string }[]; department: { name: string } | null }): string[] {
  const names = new Set(p.departments.map((d) => d.name));
  if (p.department) names.add(p.department.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Names of everything a person belongs to, keyed by grouping ("departments" or a category id). */
function personGroups(p: {
  departments: { name: string }[];
  department: { name: string } | null;
  categoryOptions: { name: string; categoryId: string }[];
  groups?: { name: string }[];
}): Record<string, string[]> {
  const out: Record<string, string[]> = { departments: departmentNames(p) };
  if (p.groups?.length) out.groups = p.groups.map((g) => g.name);
  for (const o of p.categoryOptions) (out[o.categoryId] ??= []).push(o.name);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.localeCompare(b));
  return out;
}

type GroupMember = { id: string; firstName: string; lastName: string; photoUrl: string | null; gender: string | null; status: string };
type Grouping = { key: string; label: string; groups: { id: string; name: string; members: GroupMember[] }[] };

/**
 * Every way the church groups members, with each group's members: departments
 * (both membership links, de-duplicated) plus each member category the church
 * has set up (Zone, Fellowship, ...). Categories with no options are skipped.
 */
async function groupingsWithMembers(churchId: string): Promise<Grouping[]> {
  const memberSelect = { id: true, firstName: true, lastName: true, photoUrl: true, gender: true, status: true } as const;
  const [departments, categories, churchGroups] = await Promise.all([
    db.department.findMany({
      where: { churchId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, members: { select: memberSelect }, people: { select: memberSelect } },
    }),
    db.memberCategory.findMany({
      where: { churchId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true,
        options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, members: { select: memberSelect } } },
      },
    }),
    db.group.findMany({ where: { churchId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, members: { select: memberSelect } } }),
  ]);
  const deptGroups = departments.map((d) => {
    const byId = new Map<string, GroupMember>();
    for (const m of [...d.members, ...d.people]) byId.set(m.id, m);
    return { id: d.id, name: d.name, members: [...byId.values()] };
  });
  return [
    { key: "departments", label: "Departments", groups: deptGroups },
    ...(churchGroups.length > 0 ? [{ key: "groups", label: "Groups", groups: churchGroups.map((g) => ({ id: g.id, name: g.name, members: g.members })) }] : []),
    ...categories
      .filter((c) => c.options.length > 0)
      .map((c) => ({ key: c.id, label: c.name, groups: c.options.map((o) => ({ id: o.id, name: o.name, members: o.members })) })),
  ];
}

export type BreakdownRow = {
  id: string;
  name: string;
  present: { id: string; name: string; photoUrl: string | null; gender: string | null; category: string }[];
  absent: { id: string; name: string; photoUrl: string | null; gender: string | null }[];
  byCategory: Record<AttendanceCategory, number>;
};

/**
 * Who came from each department, zone, fellowship, etc. for one service. Only
 * named check-ins can be counted (a headcount has no names). A member in two
 * groups counts in both. "Absent" leaves out members marked inactive.
 */
export async function getAttendanceBreakdown(churchId: string, sessionId: string) {
  const [groupings, records] = await Promise.all([
    groupingsWithMembers(churchId),
    db.attendanceRecord.findMany({ where: { churchId, sessionId }, select: { personId: true, category: true } }),
  ]);
  const categoryOf = new Map<string, string>();
  for (const r of records) if (r.personId) categoryOf.set(r.personId, r.category);
  const fullName = (m: GroupMember) => `${m.firstName} ${m.lastName}`.trim();
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  return {
    namedCount: records.filter((r) => r.personId).length,
    guests: records.filter((r) => !r.personId).length,
    groupings: groupings.map((g) => {
      const inSome = new Set<string>();
      const rows: BreakdownRow[] = g.groups.map((grp) => {
        const byCategory: Record<AttendanceCategory, number> = { adult: 0, teen: 0, child: 0, visitor: 0 };
        const present: BreakdownRow["present"] = [];
        const absent: BreakdownRow["absent"] = [];
        for (const m of grp.members) {
          inSome.add(m.id);
          const cat = categoryOf.get(m.id);
          if (cat) {
            present.push({ id: m.id, name: fullName(m), photoUrl: m.photoUrl, gender: m.gender, category: cat });
            byCategory[(cat as AttendanceCategory) in byCategory ? (cat as AttendanceCategory) : "adult"]++;
          } else if (m.status !== "inactive") {
            absent.push({ id: m.id, name: fullName(m), photoUrl: m.photoUrl, gender: m.gender });
          }
        }
        return { id: grp.id, name: grp.name, present: present.sort(byName), absent: absent.sort(byName), byCategory };
      });
      return {
        key: g.key,
        label: g.label,
        rows,
        notInAny: records.filter((r) => r.personId && !inSome.has(r.personId)).length,
      };
    }),
  };
}

/** Which groupings exist (for the present list's "Group by" buttons). */
export async function getGroupingLabels(churchId: string) {
  const cats = await db.memberCategory.findMany({
    where: { churchId, options: { some: {} } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const hasGroups = (await db.group.count({ where: { churchId, isActive: true } })) > 0;
  return [{ key: "departments", label: "Department" }, ...(hasGroups ? [{ key: "groups", label: "Group" }] : []), ...cats.map((c) => ({ key: c.id, label: c.name }))];
}

/**
 * Turnout per department / zone / fellowship across the most recent services
 * that had named check-ins, oldest first so it reads left to right.
 */
export async function getGroupingTrend(churchId: string, take = 6) {
  const sessions = await db.attendanceSession.findMany({
    where: { churchId, records: { some: { personId: { not: null } } } },
    orderBy: { date: "desc" },
    take,
    select: { id: true, serviceName: true, date: true },
  });
  if (sessions.length === 0) return { sessions: [], groupings: [] };

  const [groupings, records] = await Promise.all([
    groupingsWithMembers(churchId),
    db.attendanceRecord.findMany({
      where: { churchId, sessionId: { in: sessions.map((s) => s.id) }, personId: { not: null } },
      select: { sessionId: true, personId: true },
    }),
  ]);
  const present = new Set(records.map((r) => `${r.sessionId}:${r.personId}`));
  const ordered = [...sessions].reverse();

  return {
    sessions: ordered.map((s) => ({ id: s.id, serviceName: s.serviceName, date: s.date.toISOString() })),
    groupings: groupings
      .map((g) => ({
        key: g.key,
        label: g.label,
        rows: g.groups
          .map((grp) => ({
            id: grp.id,
            name: grp.name,
            members: grp.members.filter((m) => m.status !== "inactive").length,
            counts: ordered.map((s) => grp.members.filter((m) => present.has(`${s.id}:${m.id}`)).length),
          }))
          .filter((r) => r.members > 0 || r.counts.some((c) => c > 0)),
      }))
      .filter((g) => g.rows.length > 0),
  };
}

/** Minimal public info for the self check-in page (no auth). */
export async function getPublicSession(id: string) {
  const s = await db.attendanceSession.findUnique({
    where: { id },
    include: { church: { select: { name: true, slug: true, accentColor: true, logoUrl: true, isDemo: true } } },
  });
  if (!s || s.church.isDemo) return null;
  // A scheduled service's QR follows the service times, so show what's on now.
  if (s.autoKey) {
    const { describeCurrentService } = await import("@/lib/attendance/service-times");
    const now = await describeCurrentService(s.churchId, s.branchId);
    if (now) return { id: s.id, serviceName: now.name, date: new Date().toISOString(), church: s.church };
  }
  return {
    id: s.id,
    serviceName: s.serviceName,
    date: s.date.toISOString(),
    church: s.church,
  };
}
