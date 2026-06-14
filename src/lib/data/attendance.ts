import "server-only";
import { db } from "@/lib/db";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type AttendanceCategory = "adult" | "teen" | "child" | "visitor";

/** Derive an attendance category from a person's DOB/birthday + status. */
export function categoryForPerson(p: {
  status?: string | null;
  dateOfBirth?: Date | null;
  birthday?: string | null;
}): AttendanceCategory {
  if (p.status === "visitor") return "visitor";
  const age = ageFrom(p.dateOfBirth ?? null);
  if (age === null) return "adult";
  if (age < 13) return "child";
  if (age < 18) return "teen";
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
        include: { person: { select: { firstName: true, lastName: true, gender: true, photoUrl: true } } },
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
    category: r.category,
    method: r.method,
    time: r.date.toISOString(),
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
  };
}

/** Members not yet checked in to this session — for the staff check-in picker. */
export async function getCheckInCandidates(churchId: string, sessionId: string) {
  const [people, records] = await Promise.all([
    db.person.findMany({
      where: { churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, gender: true, status: true, photoUrl: true },
    }),
    db.attendanceRecord.findMany({ where: { sessionId }, select: { personId: true } }),
  ]);
  const checkedIn = new Set(records.map((r) => r.personId).filter(Boolean));
  return people
    .filter((p) => !checkedIn.has(p.id))
    .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, gender: p.gender, status: p.status }));
}

/** Minimal public info for the self check-in page (no auth). */
export async function getPublicSession(id: string) {
  const s = await db.attendanceSession.findUnique({
    where: { id },
    include: { church: { select: { name: true, slug: true, accentColor: true, logoUrl: true, isDemo: true } } },
  });
  if (!s || s.church.isDemo) return null;
  return {
    id: s.id,
    serviceName: s.serviceName,
    date: s.date.toISOString(),
    church: s.church,
  };
}
