import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const VISITOR_PAGE = 25;

export interface VisitorListRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  purpose: string | null;
  notes: string | null;
  photoUrl: string | null;
  isRegular: boolean;
  visitCount: number;
  lastVisit: string;
  visitDate: string;
  hasFingerprint: boolean;
  personId: string | null;
  invitedBy: { id: string; name: string } | null;
  invitedByName: string | null;
}

/** One page of visitors for a search and the All / Regular choice. The database does the matching and the paging. */
export async function queryVisitors(churchId: string, search: string, regularOnly: boolean, pageWanted: number) {
  const words = search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.VisitorWhereInput[] = words.map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ firstName: has }, { lastName: has }, { phone: has }, { email: has }, { purpose: has }] };
  });
  const where: Prisma.VisitorWhereInput = { churchId, ...(regularOnly ? { isRegular: true } : {}), AND: and };
  const total = await db.visitor.count({ where });
  const pages = Math.max(1, Math.ceil(total / VISITOR_PAGE));
  const page = Math.min(Math.max(1, Math.floor(pageWanted || 1)), pages);
  const visitors = await db.visitor.findMany({
    where,
    orderBy: [{ visitDate: "desc" }, { id: "asc" }],
    skip: (page - 1) * VISITOR_PAGE,
    take: VISITOR_PAGE,
    include: {
      person: { select: { id: true, biometrics: { where: { type: "scanner" }, select: { id: true }, take: 1 } } },
      invitedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const rows: VisitorListRow[] = visitors.map((v) => ({
    id: v.id,
    firstName: v.firstName,
    lastName: v.lastName,
    phone: v.phone,
    email: v.email,
    purpose: v.purpose,
    notes: v.notes,
    photoUrl: v.photoUrl,
    isRegular: v.isRegular,
    visitCount: v.visitCount,
    lastVisit: v.lastVisit.toISOString(),
    visitDate: v.visitDate.toISOString(),
    hasFingerprint: (v.person?.biometrics?.length ?? 0) > 0,
    personId: v.person?.id ?? null,
    invitedBy: v.invitedBy ? { id: v.invitedBy.id, name: `${v.invitedBy.firstName} ${v.invitedBy.lastName}`.trim() } : null,
    invitedByName: v.invitedByName,
  }));
  return { rows, total, page };
}

export async function visitorCounts(churchId: string) {
  const [all, regular] = await Promise.all([
    db.visitor.count({ where: { churchId } }),
    db.visitor.count({ where: { churchId, isRegular: true } }),
  ]);
  return { all, regular };
}
