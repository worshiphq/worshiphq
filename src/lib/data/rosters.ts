import "server-only";
import { db } from "@/lib/db";

const DEFAULT_ROLES = [
  "Word Ministration",
  "Service Leader",
  "Prayer Leader",
  "Praise & Worship",
  "Hymns Leader",
  "Announcements",
];

/**
 * The church's service roles for building rosters. Seeds a sensible editable
 * default set the first time the church opens Rosters.
 */
export async function getServiceRoles(churchId: string) {
  const existing = await db.serviceRole.findMany({
    where: { churchId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  if (existing.length > 0) return existing;

  await db.serviceRole.createMany({
    data: DEFAULT_ROLES.map((name, i) => ({ churchId, name, sortOrder: i })),
    skipDuplicates: true,
  });
  return db.serviceRole.findMany({
    where: { churchId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}
