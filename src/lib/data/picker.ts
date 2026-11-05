import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { personSearchAnd } from "@/lib/data/person-search";

export const PICKER_LIMIT = 20;

export interface PickerQuery {
  /** Who to offer: everyone, anyone who is not inactive, or only people with a phone number (for texting). */
  who?: "all" | "notInactive" | "notVisitor" | "withPhone" | "activeOrVisitor";
  /** Only adults (not children or teens). */
  adultsOnly?: boolean;
  /** Leave out people already in this group / department. */
  excludeGroupId?: string;
  excludeDepartmentId?: string;
  /** Leave out these people (already chosen elsewhere). */
  excludeIds?: string[];
}

export interface PickerOption { value: string; label: string; hint?: string; phone?: string | null; memberId?: string | null; photoUrl?: string | null }

/**
 * The people to offer in a "choose a person" box: the top matches for what has been typed, by name, member ID, email or
 * phone number in any format. Replaces loading every member into the page just to fill a dropdown.
 */
export async function queryPickerPeople(churchId: string, search: string, q: PickerQuery = {}): Promise<PickerOption[]> {
  const and = await personSearchAnd(churchId, search);
  const where: Prisma.PersonWhereInput = {
    churchId,
    ...(q.who === "activeOrVisitor" ? { status: { in: ["active", "visitor"] } } : q.who === "notInactive" ? { status: { not: "inactive" } } : q.who === "notVisitor" ? { status: { not: "visitor" } } : {}),
    ...(q.who === "withPhone" ? { phone: { not: null }, status: { not: "inactive" } } : {}),
    ...(q.adultsOnly ? { OR: [{ ageGroup: null }, { ageGroup: "adult" }] } : {}),
    ...(q.excludeGroupId ? { NOT: { groups: { some: { id: q.excludeGroupId } } } } : {}),
    ...(q.excludeDepartmentId ? { AND: [{ NOT: { departments: { some: { id: q.excludeDepartmentId } } } }, { NOT: { departmentId: q.excludeDepartmentId } }] } : {}),
    ...(q.excludeIds?.length ? { id: { notIn: q.excludeIds.slice(0, 200) } } : {}),
  };
  const people = await db.person.findMany({
    where: { ...where, AND: [...and, ...((where.AND as Prisma.PersonWhereInput[] | undefined) ?? [])] },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
    take: PICKER_LIMIT,
    select: { id: true, firstName: true, lastName: true, phone: true, memberId: true, photoUrl: true },
  });
  return people.map((p) => ({
    value: p.id,
    label: `${p.firstName} ${p.lastName}`.trim(),
    hint: [p.memberId, p.phone].filter(Boolean).join(" · ") || undefined,
    phone: p.phone,
    memberId: p.memberId,
    photoUrl: p.photoUrl,
  }));
}

/** Labels for people already chosen (so a saved choice still shows its name). Only people of this church. */
export async function pickerLabels(churchId: string, ids: string[]): Promise<PickerOption[]> {
  if (!ids.length) return [];
  const people = await db.person.findMany({
    where: { churchId, id: { in: ids.slice(0, 200) } },
    select: { id: true, firstName: true, lastName: true, phone: true, memberId: true },
  });
  return people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}`.trim(), hint: [p.memberId, p.phone].filter(Boolean).join(" · ") || undefined }));
}
