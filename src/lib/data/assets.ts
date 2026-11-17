import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { bookValueOf, straightLine, depreciationSchedule } from "@/lib/assets/depreciation";
import { daysUntil, serviceDue } from "@/lib/fleet/due";

export const ASSET_PAGE = 20;

export type AssetFilters = { category?: string; status?: string; place?: string; custodian?: string; sort?: string };

export type AssetRow = {
  id: string;
  name: string;
  tagCode: string | null;
  category: string;
  condition: string;
  status: string;
  quantity: number;
  photoUrl: string | null;
  place: string | null;
  custodian: string | null;
  serialNo: string | null;
  cost: number;
  book: number;
  isVehicle: boolean;
  vehicleId: string | null;
};

const clampPage = (total: number, size: number, want: number) => Math.min(Math.max(1, Math.floor(want || 1)), Math.max(1, Math.ceil(total / size)));

const ROW_SELECT = {
  id: true, name: true, tagCode: true, category: true, condition: true, status: true, quantity: true, photoUrl: true,
  location: true, serialNo: true, purchasePrice: true, purchaseDate: true, depreciation: true, usefulLifeYears: true,
  salvageValue: true, inServiceDate: true,
  facility: { select: { name: true } },
  custodian: { select: { firstName: true, lastName: true } },
  vehicle: { select: { id: true } },
} satisfies Prisma.AssetSelect;

type RowIn = Prisma.AssetGetPayload<{ select: typeof ROW_SELECT }>;

export function toAssetRow(a: RowIn, now = new Date()): AssetRow {
  const v = bookValueOf(a, now);
  return {
    id: a.id, name: a.name, tagCode: a.tagCode, category: a.category, condition: a.condition, status: a.status, quantity: a.quantity,
    photoUrl: a.photoUrl, place: a.facility?.name ?? a.location, custodian: a.custodian ? `${a.custodian.firstName} ${a.custodian.lastName}`.trim() : null,
    serialNo: a.serialNo, cost: v.cost, book: v.book, isVehicle: !!a.vehicle, vehicleId: a.vehicle?.id ?? null,
  };
}

/** One page of the register. Searches name, tag, serial, room, supplier and the custodian's name. */
export async function queryAssets(churchId: string, search: string, f: AssetFilters | string = {}, pageWanted = 1) {
  const filters: AssetFilters = typeof f === "string" ? { category: f } : f;
  const words = search.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 6);
  const and: Prisma.AssetWhereInput[] = words.map((w) => {
    const has = { contains: w, mode: "insensitive" as const };
    return { OR: [{ name: has }, { tagCode: has }, { serialNo: has }, { location: has }, { supplier: has }, { facility: { name: has } }, { custodian: { OR: [{ firstName: has }, { lastName: has }] } }] };
  });
  if (filters.place) and.push(filters.place.startsWith("f:") ? { facilityId: filters.place.slice(2) } : { location: filters.place });
  if (filters.custodian) and.push({ custodianId: filters.custodian });
  // Disposed items leave the everyday list unless asked for.
  const status = filters.status === "late" ? undefined : filters.status;
  if (filters.status === "late") and.push({ checkouts: { some: { returnedAt: null, dueAt: { lt: new Date() } } } });
  const where: Prisma.AssetWhereInput = {
    churchId,
    ...(filters.category ? { category: filters.category } : {}),
    ...(status ? { status } : filters.status === "late" ? {} : { status: { notIn: ["disposed"] } }),
    AND: and,
  };
  const orderBy: Prisma.AssetOrderByWithRelationInput[] =
    filters.sort === "name" ? [{ name: "asc" }, { id: "asc" }]
      : filters.sort === "value" ? [{ purchasePrice: { sort: "desc", nulls: "last" } }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "asc" }];
  const total = await db.asset.count({ where });
  const page = clampPage(total, ASSET_PAGE, pageWanted);
  const assets = await db.asset.findMany({ where, orderBy, skip: (page - 1) * ASSET_PAGE, take: ASSET_PAGE, select: ROW_SELECT });
  const now = new Date();
  return { rows: assets.map((a) => toAssetRow(a, now)), total, page };
}

/** Kept for older callers: count, cost of what is still held, and the categories in use. */
export async function assetTotals(churchId: string) {
  const s = await assetSummary(churchId);
  return { totalValue: s.book, totalCount: s.held, categories: s.categories.map((c) => c.key) };
}

export type AttentionItem = { kind: "late" | "warranty" | "service"; text: string; href: string };

/** The register band: worth today, cost, counts by status, and what needs attention. */
export async function assetSummary(churchId: string, now = new Date()) {
  const [assets, late, schedules, facilities, custodians] = await Promise.all([
    db.asset.findMany({
      where: { churchId },
      select: { id: true, name: true, category: true, status: true, quantity: true, purchasePrice: true, purchaseDate: true, depreciation: true, usefulLifeYears: true, salvageValue: true, inServiceDate: true, warrantyExpires: true, location: true, facilityId: true },
    }),
    db.assetCheckout.findMany({
      where: { churchId, returnedAt: null, dueAt: { lt: now } },
      select: { assetId: true, borrowerName: true, dueAt: true, asset: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
      take: 20,
    }),
    db.maintenanceSchedule.findMany({
      where: { churchId, active: true, asset: { status: { not: "disposed" } } },
      select: { everyDays: true, everyKm: true, lastDoneAt: true, lastDoneKm: true, title: true, assetId: true, asset: { select: { name: true, vehicle: { select: { odometerKm: true } } } } },
    }),
    db.facility.findMany({ where: { churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.asset.findMany({ where: { churchId, custodianId: { not: null } }, distinct: ["custodianId"], select: { custodian: { select: { id: true, firstName: true, lastName: true } } }, take: 200 }),
  ]);

  let cost = 0, book = 0;
  const byStatus: Record<string, number> = {};
  const cats = new Map<string, number>();
  const places = new Map<string, string>();
  for (const a of assets) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    if (a.status === "disposed" || a.status === "lost") continue;
    cats.set(a.category, (cats.get(a.category) ?? 0) + 1);
    const v = bookValueOf(a, now);
    cost += v.cost;
    book += v.book;
    if (!a.facilityId && a.location) places.set(a.location, a.location);
  }
  const attention: AttentionItem[] = [];
  for (const c of late) {
    const d = -daysUntil(c.dueAt!, now);
    attention.push({ kind: "late", text: `Overdue: ${c.asset.name} with ${c.borrowerName}, ${d} day${d === 1 ? "" : "s"}`, href: `/app/assets/${c.assetId}` });
  }
  for (const a of assets) {
    if (!a.warrantyExpires || a.status === "disposed") continue;
    const d = daysUntil(a.warrantyExpires, now);
    if (d >= 0 && d <= 30) attention.push({ kind: "warranty", text: `Warranty ends soon: ${a.name} (${d === 0 ? "today" : `${d} days`})`, href: `/app/assets/${a.id}` });
  }
  let serviceDueCount = 0;
  for (const s of schedules) {
    const due = serviceDue(s, s.asset.vehicle?.odometerKm ?? null, now);
    if (due.state === "overdue" || due.state === "soon") {
      serviceDueCount++;
      if (!s.asset.vehicle) attention.push({ kind: "service", text: `${s.title} for ${s.asset.name}: ${due.reason}`, href: `/app/assets/${s.assetId}` });
    }
  }
  const held = assets.filter((a) => a.status !== "disposed" && a.status !== "lost").length;
  return {
    cost: Math.round(cost * 100) / 100,
    book: Math.round(book * 100) / 100,
    held,
    total: assets.length,
    byStatus,
    lateCount: late.length,
    serviceDueCount,
    attention: attention.slice(0, 6),
    categories: [...cats.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    places: [...facilities.map((f) => ({ value: `f:${f.id}`, label: f.name })), ...[...places.values()].sort().map((p) => ({ value: p, label: p }))],
    custodians: custodians.filter((c) => c.custodian).map((c) => ({ value: c.custodian!.id, label: `${c.custodian!.firstName} ${c.custodian!.lastName}`.trim() })),
    facilities,
  };
}

export type TimelineEntry = { at: string; kind: "checkout" | "return" | "repair" | "service" | "inspection" | "document" | "created" | "disposed"; title: string; detail?: string | null; amount?: number | null };

/** Everything about one item, plus one merged history. */
export async function getAssetDetail(churchId: string, id: string, now = new Date()) {
  const a = await db.asset.findFirst({
    where: { id, churchId },
    include: {
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      custodian: { select: { id: true, firstName: true, lastName: true, phone: true } },
      vehicle: { select: { id: true, regNumber: true, odometerKm: true } },
      checkouts: { orderBy: { outAt: "desc" }, take: 50 },
      documents: { orderBy: { createdAt: "desc" } },
      schedules: { orderBy: { createdAt: "asc" } },
      maintenance: { orderBy: { date: "desc" }, take: 50 },
      expenses: { where: { source: "asset" }, select: { id: true, amount: true, date: true }, take: 1 },
    },
  });
  if (!a) return null;
  const value = a.depreciation === "straight-line"
    ? straightLine({ cost: a.purchasePrice, salvage: a.salvageValue, lifeYears: a.usefulLifeYears, inService: a.inServiceDate ?? a.purchaseDate, asOf: now })
    : null;
  const schedule = a.depreciation === "straight-line" ? depreciationSchedule({ cost: a.purchasePrice, salvage: a.salvageValue, lifeYears: a.usefulLifeYears, inService: a.inServiceDate ?? a.purchaseDate }) : [];

  const timeline: TimelineEntry[] = [{ at: a.createdAt.toISOString(), kind: "created", title: "Added to the register" }];
  for (const c of a.checkouts) {
    timeline.push({ at: c.outAt.toISOString(), kind: "checkout", title: `Lent to ${c.borrowerName}`, detail: [c.purpose, c.dueAt ? `due back ${c.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null].filter(Boolean).join(", ") || null });
    if (c.returnedAt) timeline.push({ at: c.returnedAt.toISOString(), kind: "return", title: `Returned by ${c.borrowerName}`, detail: c.conditionIn ? `Condition: ${c.conditionIn}` : null });
  }
  for (const m of a.maintenance) timeline.push({ at: m.date.toISOString(), kind: m.kind === "repair" ? "repair" : m.kind === "inspection" ? "inspection" : "service", title: m.title, detail: [m.vendorName, m.odometerKm ? `${m.odometerKm.toLocaleString("en-GB")} km` : null, m.notes].filter(Boolean).join(" · ") || null, amount: m.cost });
  for (const d of a.documents) timeline.push({ at: d.createdAt.toISOString(), kind: "document", title: `Document added: ${d.name}` });
  if (a.disposedAt) timeline.push({ at: a.disposedAt.toISOString(), kind: "disposed", title: `Disposed (${a.disposalMethod ?? "other"})`, detail: a.disposalNote, amount: a.disposalAmount });
  timeline.sort((x, y) => y.at.localeCompare(x.at));

  const openCheckout = a.checkouts.find((c) => !c.returnedAt) ?? null;
  return {
    asset: a,
    value,
    book: bookValueOf(a, now),
    schedule,
    timeline,
    openCheckout,
    schedules: a.schedules.map((s) => ({ ...s, due: serviceDue(s, a.vehicle?.odometerKm ?? null, now) })),
    purchaseExpense: a.expenses[0] ?? null,
  };
}
