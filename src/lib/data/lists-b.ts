import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { personSearchAnd } from "@/lib/data/person-search";

const clampPage = (total: number, size: number, want: number) => {
  const pages = Math.max(1, Math.ceil(total / size));
  return Math.min(Math.max(1, Math.floor(want || 1)), pages);
};

export const MEMBER_PAGE = 25;

export interface MemberLine { id: string; name: string; phone: string | null; photoUrl: string | null; gender: string | null; inactive: boolean }
const MEMBER_SELECT = { id: true, firstName: true, lastName: true, phone: true, photoUrl: true, gender: true, status: true } satisfies Prisma.PersonSelect;
const toLine = (m: { id: string; firstName: string; lastName: string; phone: string | null; photoUrl: string | null; gender: string | null; status: string }): MemberLine => ({
  id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), phone: m.phone, photoUrl: m.photoUrl, gender: m.gender, inactive: m.status === "inactive",
});

/** One page of a group's or department's members for a search, plus how many of all its members have a phone number. */
async function memberPage(churchId: string, scope: Prisma.PersonWhereInput, search: string, pageWanted: number) {
  const and = await personSearchAnd(churchId, search);
  const where: Prisma.PersonWhereInput = { churchId, AND: [scope, ...and] };
  const [total, reachable, everyone] = await Promise.all([
    db.person.count({ where }),
    db.person.count({ where: { churchId, AND: [scope], phone: { not: null } } }),
    db.person.count({ where: { churchId, AND: [scope] } }),
  ]);
  const page = clampPage(total, MEMBER_PAGE, pageWanted);
  const people = await db.person.findMany({
    where, orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }], skip: (page - 1) * MEMBER_PAGE, take: MEMBER_PAGE, select: MEMBER_SELECT,
  });
  return { rows: people.map(toLine), total, page, extra: { reachable, everyone } };
}

export const queryGroupMembers = (churchId: string, groupId: string, search: string, page: number) =>
  memberPage(churchId, { groups: { some: { id: groupId } } }, search, page);

/** Department members include people linked only by the older single-department field. */
export const queryDepartmentMembers = (churchId: string, departmentId: string, search: string, page: number) =>
  memberPage(churchId, { OR: [{ departments: { some: { id: departmentId } } }, { departmentId }] }, search, page);

export async function groupMemberIds(groupId: string): Promise<string[]> {
  const rows = await db.person.findMany({ where: { groups: { some: { id: groupId } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

// ---------------- Assets ----------------
export const ASSET_PAGE = 20;
export async function queryAssets(churchId: string, search: string, category: string, pageWanted: number) {
  const words = search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.AssetWhereInput[] = words.map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ name: has }, { location: has }, { serialNo: has }] };
  });
  const where: Prisma.AssetWhereInput = { churchId, ...(category ? { category } : {}), AND: and };
  const total = await db.asset.count({ where });
  const page = clampPage(total, ASSET_PAGE, pageWanted);
  const assets = await db.asset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * ASSET_PAGE, take: ASSET_PAGE });
  return {
    rows: assets.map((a) => ({
      id: a.id, name: a.name, category: a.category, condition: a.condition, location: a.location, serialNo: a.serialNo,
      purchasePrice: a.purchasePrice, purchaseDate: a.purchaseDate?.toISOString() ?? null, notes: a.notes,
    })),
    total,
    page,
  };
}
export async function assetTotals(churchId: string) {
  const [agg, count, cats] = await Promise.all([
    db.asset.aggregate({ where: { churchId }, _sum: { purchasePrice: true } }),
    db.asset.count({ where: { churchId } }),
    db.asset.findMany({ where: { churchId }, distinct: ["category"], select: { category: true } }),
  ]);
  return { totalValue: Number(agg._sum.purchasePrice ?? 0), totalCount: count, categories: cats.map((c) => c.category).sort() };
}

export async function departmentMemberIds(churchId: string, departmentId: string): Promise<string[]> {
  const rows = await db.person.findMany({
    where: { churchId, OR: [{ departments: { some: { id: departmentId } } }, { departmentId }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ---------------- Counseling ----------------
import { hmInTz, whenInTz, ymdInTz } from "@/lib/time/tz";
import { asExtra } from "@/components/app/extra-answers";

export const COUNSEL_PAGE = 12;
export interface CounselFilters { status: string; type: string; counselorId: string; sinceMs: number | null; quick: "" | "upcoming" | "overdue" }

export async function queryCounseling(churchId: string, search: string, f: CounselFilters, pageWanted: number) {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { timezone: true } });
  const tz = church?.timezone ?? "Africa/Accra";
  const now = new Date();
  const words = search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.CounselingSessionWhereInput[] = words.map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ summary: has }, { counseleeName: has }, { counseleePhone: { contains: w } }, { person: { is: { OR: [{ firstName: has }, { lastName: has }, { phone: { contains: w } }] } } }] };
  });
  const where: Prisma.CounselingSessionWhereInput = {
    churchId,
    ...(f.status && f.status !== "all" ? { status: f.status } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.counselorId ? { counselorId: f.counselorId } : {}),
    ...(f.sinceMs !== null ? { date: { gte: new Date(f.sinceMs) } } : {}),
    ...(f.quick === "upcoming" ? { status: { not: "closed" }, scheduledAt: { gte: now } } : f.quick === "overdue" ? { status: { not: "closed" }, followUpDate: { lt: now } } : {}),
    AND: and,
  };
  const total = await db.counselingSession.count({ where });
  const page = clampPage(total, COUNSEL_PAGE, pageWanted);
  const sessions = await db.counselingSession.findMany({
    where,
    orderBy: f.quick === "upcoming" ? [{ scheduledAt: "asc" }, { id: "asc" }] : [{ date: "desc" }, { id: "asc" }],
    skip: (page - 1) * COUNSEL_PAGE, take: COUNSEL_PAGE,
    include: { person: { select: { firstName: true, lastName: true, phone: true } }, counselor: { select: { name: true } }, _count: { select: { messages: true } } },
  });
  const rows = sessions.map((s) => ({
    id: s.id, type: s.type, summary: s.summary, notes: s.notes, status: s.status, confidential: s.confidential, personId: s.personId,
    memberName: s.person ? `${s.person.firstName} ${s.person.lastName}`.trim() : null,
    counseleeName: s.counseleeName, phone: s.person?.phone ?? s.counseleePhone ?? null, counseleePhone: s.counseleePhone,
    counselorId: s.counselorId, counselorName: s.counselor?.name ?? null,
    date: s.date.toISOString(), dateYmd: ymdInTz(s.date, tz),
    followUpDate: s.followUpDate?.toISOString() ?? null, followUpYmd: s.followUpDate ? ymdInTz(s.followUpDate, tz) : "",
    scheduledAt: s.scheduledAt?.toISOString() ?? null, scheduledYmd: s.scheduledAt ? ymdInTz(s.scheduledAt, tz) : "",
    scheduledHm: s.scheduledAt ? hmInTz(s.scheduledAt, tz) : "", scheduledLabel: s.scheduledAt ? whenInTz(s.scheduledAt, tz) : null,
    textUpdates: s.textUpdates, extra: asExtra(s.extra), reminderSent: !!s.reminderSentAt, messageCount: s._count.messages,
  }));
  return { rows, total, page };
}
export async function counselingMeta(churchId: string) {
  const now = new Date();
  const [total, open, overdue, upcoming, types] = await Promise.all([
    db.counselingSession.count({ where: { churchId } }),
    db.counselingSession.count({ where: { churchId, status: "open" } }),
    db.counselingSession.count({ where: { churchId, status: { not: "closed" }, followUpDate: { lt: now } } }),
    db.counselingSession.count({ where: { churchId, status: { not: "closed" }, scheduledAt: { gte: now } } }),
    db.counselingSession.findMany({ where: { churchId }, distinct: ["type"], select: { type: true } }),
  ]);
  return { total, open, overdue, upcoming, types: types.map((t) => t.type).sort() };
}
