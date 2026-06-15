import "server-only";
import { db } from "@/lib/db";

const STOP = new Set(["of", "the", "and", "for", "a", "an", "in", "at", "ministries", "ministry", "church", "international", "global"]);

/** Derive a member-ID prefix from a church name, e.g. "Grace Baptist Church" → "GBC". */
export function churchInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  const base = (words.length ? words : name.split(/\s+/))
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return (base || "CH").slice(0, 4);
}

/** Atomically issue the next member ID for a church, e.g. "GBC-0001". */
export async function nextMemberId(churchId: string): Promise<string> {
  const c = await db.church.update({
    where: { id: churchId },
    data: { memberSeq: { increment: 1 } },
    select: { memberSeq: true, memberPrefix: true, name: true },
  });
  const prefix = c.memberPrefix || churchInitials(c.name);
  if (!c.memberPrefix) {
    await db.church.update({ where: { id: churchId }, data: { memberPrefix: prefix } });
  }
  return `${prefix}-${String(c.memberSeq).padStart(4, "0")}`;
}

/** Resolve department names to their IDs within a church (unknown names ignored). */
export async function resolveDepartmentIds(churchId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const depts = await db.department.findMany({
    where: { churchId, name: { in: names } },
    select: { id: true },
  });
  return depts.map((d) => d.id);
}
