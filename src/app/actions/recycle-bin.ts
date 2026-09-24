"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanDelete } from "@/lib/auth";
import { db } from "@/lib/db";
import { restoreItem, purgeItem, ENTITY_LABELS, type EntityType } from "@/lib/recycle-bin";
import { audit } from "@/lib/audit";

export type RecycleBinItem = {
  id: string;
  source: "generic" | "roster";
  entityType: string;
  entityLabel: string;
  label: string;
  detail: string | null;
  deletedAt: string;
  deletedByName: string | null;
};

export async function getRecycleBinItems(): Promise<RecycleBinItem[]> {
  const session = await requireSession();

  const [deletedItems, rosters] = await Promise.all([
    db.deletedItem.findMany({ where: { churchId: session.churchId }, orderBy: { deletedAt: "desc" } }),
    db.volunteerRoster.findMany({ where: { churchId: session.churchId, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } }),
  ]);

  const generic: RecycleBinItem[] = deletedItems.map((d) => ({
    id: d.id,
    source: "generic",
    entityType: d.entityType,
    entityLabel: ENTITY_LABELS[d.entityType as EntityType] ?? d.entityType,
    label: d.label,
    detail: d.detail,
    deletedAt: d.deletedAt.toISOString(),
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
    deletedByName: null,
  }));

  return [...generic, ...rosterItems].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

export async function getRecycleBinCount(): Promise<number> {
  const session = await requireSession();
  const [genericCount, rosterCount] = await Promise.all([
    db.deletedItem.count({ where: { churchId: session.churchId } }),
    db.volunteerRoster.count({ where: { churchId: session.churchId, deletedAt: { not: null } } }),
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
