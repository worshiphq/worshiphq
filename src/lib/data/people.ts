import "server-only";
import { db } from "@/lib/db";
import type { PersonStatus } from "@prisma/client";

export interface PersonRow {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: PersonStatus;
  engagement: "thriving" | "steady" | "at-risk" | "new";
  branch: string | null;
  ministries: string[];
  household: string | null;
  location: string | null;
  birthday: string | null;
  anniversary: string | null;
  joined: string; // ISO
}

function engagementFor(status: PersonStatus): PersonRow["engagement"] {
  if (status === "visitor") return "new";
  if (status === "inactive") return "at-risk";
  return "steady";
}

export async function getPeople(churchId: string): Promise<PersonRow[]> {
  const people = await db.person.findMany({
    where: { churchId },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: { branch: { select: { name: true } }, groups: { select: { name: true } }, household: { select: { name: true } } },
  });
  return people.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`,
    email: p.email,
    phone: p.phone,
    status: p.status,
    engagement: engagementFor(p.status),
    branch: p.branch?.name ?? null,
    ministries: p.groups.map((g) => g.name),
    household: p.household?.name ?? null,
    location: p.location,
    birthday: p.birthday,
    anniversary: p.anniversary,
    joined: p.joinedAt.toISOString(),
  }));
}

export async function getPeopleStats(churchId: string) {
  const [total, active, visitors, ministries] = await Promise.all([
    db.person.count({ where: { churchId } }),
    db.person.count({ where: { churchId, status: "active" } }),
    db.person.count({ where: { churchId, status: "visitor" } }),
    db.group.count({ where: { churchId, type: "ministry" } }),
  ]);
  return { total, active, visitors, ministries };
}
