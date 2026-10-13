"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanDelete } from "@/lib/auth";
import { db } from "@/lib/db";
import { restoreItem, purgeItem, purgeExpiredBinItems, binCutoff, ENTITY_LABELS } from "@/lib/recycle-bin";
import { RECYCLE_BIN_DAYS } from "@/lib/recycle-bin-config";
import { audit } from "@/lib/audit";

export type RecycleBinItem = {
  id: string;
  source: "generic" | "roster";
  entityType: string;
  entityLabel: string;
  label: string;
  detail: string | null;
  deletedAt: string;
  /** When it will be permanently removed. */
  expiresAt: string;
  deletedByName: string | null;
};

const expiry = (d: Date) => new Date(d.getTime() + RECYCLE_BIN_DAYS * 24 * 60 * 60 * 1000).toISOString();

export async function getRecycleBinItems(): Promise<RecycleBinItem[]> {
  const session = await requireSession();
  // Clear anything past its 7 days now, rather than waiting for the nightly sweep.
  await purgeExpiredBinItems(session.churchId).catch(() => {});

  const [deletedItems, rosters] = await Promise.all([
    db.deletedItem.findMany({ where: { churchId: session.churchId }, orderBy: { deletedAt: "desc" } }),
    db.volunteerRoster.findMany({ where: { churchId: session.churchId, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } }),
  ]);

  const generic: RecycleBinItem[] = deletedItems.map((d) => ({
    id: d.id,
    source: "generic",
    entityType: d.entityType,
    entityLabel: ENTITY_LABELS[d.entityType] ?? d.entityType,
    label: d.label,
    detail: d.detail,
    deletedAt: d.deletedAt.toISOString(),
    expiresAt: expiry(d.deletedAt),
    deletedByName: d.deletedByName,
  }));

  const rosterItems: RecycleBinItem[] = rosters.map((r) => ({
    id: r.id,
    source: "roster",
    entityType: "volunteerRoster",
    entityLabel: "Volunteer roster",
    label: r.name,
    detail: r.ministry,
    deletedAt: (r.deletedAt as Date).toISOString(),
    expiresAt: expiry(r.deletedAt as Date),
    deletedByName: null,
  }));

  return [...generic, ...rosterItems].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

export async function getRecycleBinCount(): Promise<number> {
  const session = await requireSession();
  const [genericCount, rosterCount] = await Promise.all([
    db.deletedItem.count({ where: { churchId: session.churchId, deletedAt: { gte: binCutoff() } } }),
    db.volunteerRoster.count({ where: { churchId: session.churchId, deletedAt: { gte: binCutoff() } } }),
  ]);
  return genericCount + rosterCount;
}

export async function restoreRecycleBinItem(id: string, source: "generic" | "roster") {
  const session = await requireSession();
  assertCanDelete(session);

  if (source === "roster") {
    const r = await db.volunteerRoster.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
    if (!r) return { ok: false as const, error: "Already gone." };
    await db.volunteerRoster.updateMany({ where: { id, churchId: session.churchId }, data: { deletedAt: null } });
    await audit(session, "update", "roster", `Restored roster "${r.name}"`, id);
    revalidatePath("/app/rosters");
    revalidatePath("/app");
    return { ok: true as const };
  }

  const result = await restoreItem(session, id);
  revalidatePath("/app", "layout");
  return result;
}

export async function purgeRecycleBinItem(id: string, source: "generic" | "roster") {
  const session = await requireSession();
  assertCanDelete(session);

  if (source === "roster") {
    const r = await db.volunteerRoster.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
    if (!r) return { ok: false as const, error: "Already gone." };
    await db.volunteerRoster.deleteMany({ where: { id, churchId: session.churchId, deletedAt: { not: null } } });
    await audit(session, "delete", "roster", `Permanently deleted roster "${r.name}"`, id);
    revalidatePath("/app/rosters");
    revalidatePath("/app");
    return { ok: true as const };
  }

  const result = await purgeItem(session, id);
  revalidatePath("/app", "layout");
  return result;
}
