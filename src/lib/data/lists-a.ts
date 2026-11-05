import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { asExtra } from "@/components/app/extra-answers";

/** Words typed into a search box: every word must appear in at least one of the given text columns. */
function wordsAnd<T>(search: string, columns: (keyof T & string)[], build: (col: string, has: { contains: string; mode: "insensitive" }) => T): T[] {
  return search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6).map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: columns.map((c) => build(c, has)) } as unknown as T;
  });
}

const clampPage = (total: number, size: number, want: number) => {
  const pages = Math.max(1, Math.ceil(total / size));
  return { pages, page: Math.min(Math.max(1, Math.floor(want || 1)), pages) };
};

// ---------------- Notices ----------------
export const NOTICE_PAGE = 20;
export async function queryNotices(churchId: string, search: string, pageWanted: number) {
  const and = wordsAnd<Prisma.ChurchNoticeWhereInput>(search, ["title", "body"], (c, has) => ({ [c]: has }) as Prisma.ChurchNoticeWhereInput);
  const where: Prisma.ChurchNoticeWhereInput = { churchId, AND: and };
  const total = await db.churchNotice.count({ where });
  const { page } = clampPage(total, NOTICE_PAGE, pageWanted);
  const items = await db.churchNotice.findMany({ where, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * NOTICE_PAGE, take: NOTICE_PAGE });
  return {
    rows: items.map((n) => ({ id: n.id, title: n.title, body: n.body, pinned: n.pinned, createdAt: n.createdAt.toISOString() })),
    total,
    page,
  };
}

// ---------------- Testimonies ----------------
export const TESTIMONY_PAGE = 20;
export async function queryTestimonies(churchId: string, search: string, category: string, pageWanted: number) {
  const and = wordsAnd<Prisma.TestimonyWhereInput>(search, ["title", "body"], (c, has) => ({ [c]: has }) as Prisma.TestimonyWhereInput);
  const where: Prisma.TestimonyWhereInput = { churchId, ...(category && category !== "all" ? { category } : {}), AND: and };
  const total = await db.testimony.count({ where });
  const { page } = clampPage(total, TESTIMONY_PAGE, pageWanted);
  const items = await db.testimony.findMany({
    where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: (page - 1) * TESTIMONY_PAGE, take: TESTIMONY_PAGE,
    include: { person: { select: { firstName: true, lastName: true } } },
  });
  return {
    rows: items.map((t) => ({
      id: t.id, title: t.title, body: t.body, category: t.category, status: t.status, anonymous: t.anonymous,
      memberName: t.person ? `${t.person.firstName} ${t.person.lastName}` : null, extra: asExtra(t.extra), date: t.date.toISOString(),
    })),
    total,
    page,
  };
}
export async function testimonyStats(churchId: string) {
  const [total, featured, praise, healing] = await Promise.all([
    db.testimony.count({ where: { churchId } }),
    db.testimony.count({ where: { churchId, status: "featured" } }),
    db.testimony.count({ where: { churchId, category: "praise" } }),
    db.testimony.count({ where: { churchId, category: "healing" } }),
  ]);
  return { total, featured, praise, healing };
}

// ---------------- Prayer requests ----------------
export const PRAYER_PAGE = 20;
export interface PrayerFilters { tab: "active" | "prayed" | "archived" | "all"; period: string; who: "" | "named" | "anonymous"; sort: "new" | "old"; sinceMs: number | null }

function prayerBase(churchId: string, search: string, f: PrayerFilters): Prisma.PrayerRequestWhereInput {
  const and = wordsAnd<Prisma.PrayerRequestWhereInput>(search, ["name", "request"], (c, has) => ({ [c]: has }) as Prisma.PrayerRequestWhereInput);
  return {
    churchId,
    ...(f.sinceMs !== null ? { createdAt: { gte: new Date(f.sinceMs) } } : {}),
    ...(f.who === "anonymous" ? { isAnonymous: true } : f.who === "named" ? { isAnonymous: false } : {}),
    AND: and,
  };
}

export async function queryPrayer(churchId: string, search: string, f: PrayerFilters, pageWanted: number) {
  const base = prayerBase(churchId, search, f);
  const where: Prisma.PrayerRequestWhereInput = f.tab === "all" ? base : { ...base, status: f.tab };
  const [total, grouped] = await Promise.all([
    db.prayerRequest.count({ where }),
    db.prayerRequest.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const { page } = clampPage(total, PRAYER_PAGE, pageWanted);
  const items = await db.prayerRequest.findMany({
    where, orderBy: [{ createdAt: f.sort === "old" ? "asc" : "desc" }, { id: "asc" }], skip: (page - 1) * PRAYER_PAGE, take: PRAYER_PAGE,
  });
  const c = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const counts = { active: c("active"), prayed: c("prayed"), archived: c("archived"), all: grouped.reduce((a, g) => a + g._count._all, 0) };
  return {
    rows: items.map((r) => ({
      id: r.id, name: r.name, request: r.request, isAnonymous: r.isAnonymous, status: r.status, extra: asExtra(r.extra),
      prayedAt: r.prayedAt?.toISOString() ?? null, prayedBy: r.prayedBy, createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    extra: counts,
  };
}
/** Ids of the new requests matching the current search and filters, for "mark all as prayed for". Limited to 1000. */
export async function prayerActiveIds(churchId: string, search: string, f: PrayerFilters): Promise<string[]> {
  const rows = await db.prayerRequest.findMany({ where: { ...prayerBase(churchId, search, f), status: "active" }, select: { id: true }, take: 1000 });
  return rows.map((r) => r.id);
}

// ---------------- Sermons ----------------
export const SERMON_PAGE = 15;
export interface SermonFilters { preacher: string; series: string; year: string; state: "" | "published" | "draft" }
export async function querySermons(churchId: string, search: string, f: SermonFilters, pageWanted: number) {
  const and = wordsAnd<Prisma.SermonWhereInput>(search, ["title", "preacher", "series", "scripture", "notes"], (c, has) => ({ [c]: has }) as Prisma.SermonWhereInput);
  const y = Number(f.year);
  const where: Prisma.SermonWhereInput = {
    churchId,
    ...(f.preacher ? { preacher: f.preacher } : {}),
    ...(f.series ? { series: f.series } : {}),
    ...(f.year && y ? { date: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } } : {}),
    ...(f.state === "published" ? { published: true } : f.state === "draft" ? { published: false } : {}),
    AND: and,
  };
  const total = await db.sermon.count({ where });
  const { page } = clampPage(total, SERMON_PAGE, pageWanted);
  const items = await db.sermon.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: (page - 1) * SERMON_PAGE, take: SERMON_PAGE });
  return {
    rows: items.map((s) => ({
      id: s.id, title: s.title, preacher: s.preacher, series: s.series, scripture: s.scripture, notes: s.notes,
      audioUrl: s.audioUrl, videoUrl: s.videoUrl, published: s.published, date: s.date.toISOString(),
    })),
    total,
    page,
  };
}
/** The choices in the Preacher / Series / Year dropdowns. */
export async function sermonOptions(churchId: string) {
  const [pre, ser, dates] = await Promise.all([
    db.sermon.findMany({ where: { churchId, preacher: { not: null } }, distinct: ["preacher"], select: { preacher: true } }),
    db.sermon.findMany({ where: { churchId, series: { not: null } }, distinct: ["series"], select: { series: true } }),
    db.sermon.findMany({ where: { churchId }, select: { date: true } }),
  ]);
  return {
    preachers: pre.map((p) => p.preacher!).sort(),
    series: ser.map((p) => p.series!).sort(),
    years: [...new Set(dates.map((d) => d.date.getFullYear()))].sort((a, b) => b - a),
  };
}

// ---------------- Devotionals ----------------
export const DEVOTIONAL_PAGE = 12;
export interface DevotionalFilters { author: string; year: string; state: "" | "published" | "draft" }
export async function queryDevotionals(churchId: string, search: string, f: DevotionalFilters, pageWanted: number) {
  const and = wordsAnd<Prisma.DevotionalWhereInput>(search, ["title", "body", "scripture"], (c, has) => ({ [c]: has }) as Prisma.DevotionalWhereInput);
  const y = Number(f.year);
  const where: Prisma.DevotionalWhereInput = {
    churchId,
    ...(f.author ? { author: f.author } : {}),
    ...(f.year && y ? { date: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } } : {}),
    ...(f.state === "published" ? { published: true } : f.state === "draft" ? { published: false } : {}),
    AND: and,
  };
  const total = await db.devotional.count({ where });
  const { page } = clampPage(total, DEVOTIONAL_PAGE, pageWanted);
  const items = await db.devotional.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: (page - 1) * DEVOTIONAL_PAGE, take: DEVOTIONAL_PAGE });
  return {
    rows: items.map((d) => ({ id: d.id, title: d.title, scripture: d.scripture, body: d.body, author: d.author, published: d.published, date: d.date.toISOString() })),
    total,
    page,
  };
}
export async function devotionalOptions(churchId: string) {
  const [au, dates] = await Promise.all([
    db.devotional.findMany({ where: { churchId, author: { not: null } }, distinct: ["author"], select: { author: true } }),
    db.devotional.findMany({ where: { churchId }, select: { date: true } }),
  ]);
  return { authors: au.map((a) => a.author!).sort(), years: [...new Set(dates.map((d) => d.date.getFullYear()))].sort((a, b) => b - a) };
}

// ---------------- Audit log ----------------
export const AUDIT_PAGE = 30;
export interface AuditFilters { entity: string; action: string; user: string; fromMs: number | null; toMs: number | null }
export async function queryAudit(churchId: string, search: string, f: AuditFilters, pageWanted: number) {
  const words = search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.AuditLogWhereInput[] = words.map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ detail: has }, { entity: has }, { action: has }, { user: { is: { name: has } } }] };
  });
  const where: Prisma.AuditLogWhereInput = {
    churchId,
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.user ? { user: { is: { name: f.user } } } : {}),
    ...(f.fromMs !== null || f.toMs !== null ? { createdAt: { ...(f.fromMs !== null ? { gte: new Date(f.fromMs) } : {}), ...(f.toMs !== null ? { lte: new Date(f.toMs) } : {}) } } : {}),
    AND: and,
  };
  const total = await db.auditLog.count({ where });
  const { page } = clampPage(total, AUDIT_PAGE, pageWanted);
  const logs = await db.auditLog.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * AUDIT_PAGE, take: AUDIT_PAGE,
    include: { user: { select: { name: true, email: true } } },
  });
  return {
    rows: logs.map((l) => ({ id: l.id, action: l.action, entity: l.entity, entityId: l.entityId, detail: l.detail, userName: l.user.name, userEmail: l.user.email, createdAt: l.createdAt.toISOString() })),
    total,
    page,
  };
}
export async function auditOptions(churchId: string) {
  const [ent, act, users] = await Promise.all([
    db.auditLog.findMany({ where: { churchId }, distinct: ["entity"], select: { entity: true } }),
    db.auditLog.findMany({ where: { churchId }, distinct: ["action"], select: { action: true } }),
    db.user.findMany({ where: { churchId }, select: { name: true } }),
  ]);
  return {
    entities: ent.map((e) => e.entity).sort(),
    actions: act.map((a) => a.action).sort(),
    users: [...new Set(users.map((u) => u.name))].sort((a, b) => a.localeCompare(b)),
  };
}
