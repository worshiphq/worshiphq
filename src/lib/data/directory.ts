import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { personSearchAnd } from "@/lib/data/person-search";

export const DIRECTORY_PAGE = 24;

export interface DirectoryRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  memberId: string | null;
  occupation: string | null;
  departments: string[];
  groupIds: string[];
}

/** One page of active members for a search, a department and a group. The database does the matching and the paging. */
export async function queryDirectory(churchId: string, search: string, department: string, groupId: string, pageWanted: number) {
  const and = await personSearchAnd(churchId, search, ["occupation"]);
  const where: Prisma.PersonWhereInput = {
    churchId,
    status: "active",
    ...(department ? { departments: { some: { name: department } } } : {}),
    ...(groupId ? { groups: { some: { id: groupId, isActive: true } } } : {}),
    AND: and,
  };
  const total = await db.person.count({ where });
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE));
  const page = Math.min(Math.max(1, Math.floor(pageWanted || 1)), pages);
  const people = await db.person.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
    skip: (page - 1) * DIRECTORY_PAGE,
    take: DIRECTORY_PAGE,
    select: {
      id: true, firstName: true, lastName: true, phone: true, email: true, photoUrl: true, title: true, occupation: true, memberId: true,
      departments: { select: { id: true, name: true } },
      groups: { where: { isActive: true }, select: { id: true } },
    },
  });
  const rows: DirectoryRow[] = people.map((p) => ({
    id: p.id,
    name: `${p.title ? p.title + " " : ""}${p.firstName} ${p.lastName}`,
    phone: p.phone,
    email: p.email,
    photoUrl: p.photoUrl,
    memberId: p.memberId,
    occupation: p.occupation,
    departments: p.departments.map((d) => d.name),
    groupIds: p.groups.map((g) => g.id),
  }));
  return { rows, total, page };
}
