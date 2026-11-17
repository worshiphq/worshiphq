import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const REQUEST_PAGE = 30;
export type RequestFilters = { status?: string; priority?: string; reportedBy?: string };

export type RequestRow = {
  id: string; title: string; description: string | null; place: string | null; priority: string; status: string; photoUrl: string | null;
  reportedByName: string | null; assignee: string | null; assigneeUserId: string | null; vendorId: string | null; dueDate: string | null;
  estimatedCost: number | null; actualCost: number | null; createdAt: string; resolvedAt: string | null; resolution: string | null;
  assetId: string | null; assetName: string | null; expenseId: string | null;
};

const INCLUDE = { facility: { select: { name: true } }, asset: { select: { name: true } }, assignee: { select: { name: true } }, vendor: { select: { name: true } } } satisfies Prisma.MaintenanceRequestInclude;

export function toRequestRow(r: Prisma.MaintenanceRequestGetPayload<{ include: typeof INCLUDE }>): RequestRow {
  return {
    id: r.id, title: r.title, description: r.description, place: r.facility?.name ?? r.location, priority: r.priority, status: r.status, photoUrl: r.photoUrl,
    reportedByName: r.reportedByName, assignee: r.assignee?.name ?? r.assigneeName ?? r.vendor?.name ?? null, assigneeUserId: r.assigneeUserId, vendorId: r.vendorId,
    dueDate: r.dueDate?.toISOString() ?? null, estimatedCost: r.estimatedCost, actualCost: r.actualCost, createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null, resolution: r.resolution, assetId: r.assetId, assetName: r.asset?.name ?? null, expenseId: r.expenseId,
  };
}

/** Open work plus anything finished in the last 30 days (the board), or a filtered page (the list). */
export async function queryRequests(churchId: string, search: string, f: RequestFilters, pageWanted: number) {
  const and: Prisma.MaintenanceRequestWhereInput[] = [];
  const q = search.trim().slice(0, 60);
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  if (f.status === "done") and.push({ status: "done", resolvedAt: { gte: new Date(Date.now() - 30 * 86400000) } });
  else if (f.status) and.push({ status: f.status });
  else and.push({ OR: [{ status: { in: ["open", "assigned", "in-progress"] } }, { status: "done", resolvedAt: { gte: new Date(Date.now() - 30 * 86400000) } }] });
  if (f.priority) and.push({ priority: f.priority });
  if (f.reportedBy) and.push({ reportedById: f.reportedBy });
  const where: Prisma.MaintenanceRequestWhereInput = { churchId, AND: and };
  const total = await db.maintenanceRequest.count({ where });
  const page = Math.min(Math.max(1, pageWanted || 1), Math.max(1, Math.ceil(total / REQUEST_PAGE)));
  const rows = await db.maintenanceRequest.findMany({ where, include: INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * REQUEST_PAGE, take: REQUEST_PAGE });
  return { rows: rows.map(toRequestRow), total, page };
}

export async function requestCounts(churchId: string, reportedBy?: string) {
  const base = { churchId, ...(reportedBy ? { reportedById: reportedBy } : {}) };
  const [open, assigned, progress, done, urgent] = await Promise.all([
    db.maintenanceRequest.count({ where: { ...base, status: "open" } }),
    db.maintenanceRequest.count({ where: { ...base, status: "assigned" } }),
    db.maintenanceRequest.count({ where: { ...base, status: "in-progress" } }),
    db.maintenanceRequest.count({ where: { ...base, status: "done", resolvedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    db.maintenanceRequest.count({ where: { ...base, priority: "urgent", status: { in: ["open", "assigned", "in-progress"] } } }),
  ]);
  return { open, assigned, "in-progress": progress, done, urgent };
}
