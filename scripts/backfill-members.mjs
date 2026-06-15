// One-off backfill: member-ID prefixes, member IDs, and department M2M links.
// Run: node --env-file=.env scripts/backfill-members.mjs
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const STOP = new Set(["of", "the", "and", "for", "a", "an", "in", "at", "ministries", "ministry", "church", "international", "global"]);
function initials(name) {
  const words = name.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  const base = (words.length ? words : name.split(/\s+/)).map((w) => w[0]).join("").toUpperCase().replace(/[^A-Z]/g, "");
  return (base || "CH").slice(0, 4);
}
function pad(n) { return String(n).padStart(4, "0"); }

const churches = await db.church.findMany({ select: { id: true, name: true, memberPrefix: true, memberSeq: true } });
let totalIds = 0, totalLinks = 0;

for (const c of churches) {
  const prefix = c.memberPrefix || initials(c.name);
  if (!c.memberPrefix) {
    await db.church.update({ where: { id: c.id }, data: { memberPrefix: prefix } });
  }

  // Department M2M backfill from legacy departmentId.
  const withDept = await db.person.findMany({
    where: { churchId: c.id, departmentId: { not: null } },
    select: { id: true, departmentId: true },
  });
  for (const p of withDept) {
    await db.person.update({
      where: { id: p.id },
      data: { departments: { connect: { id: p.departmentId } } },
    });
    totalLinks++;
  }

  // Member IDs in join order for those missing one.
  const people = await db.person.findMany({
    where: { churchId: c.id, memberId: null },
    orderBy: { joinedAt: "asc" },
    select: { id: true },
  });
  let seq = c.memberSeq || 0;
  for (const p of people) {
    seq++;
    await db.person.update({ where: { id: p.id }, data: { memberId: `${prefix}-${pad(seq)}` } });
    totalIds++;
  }
  if (seq !== (c.memberSeq || 0)) {
    await db.church.update({ where: { id: c.id }, data: { memberSeq: seq } });
  }
}

console.log(`Backfill done: ${churches.length} churches, ${totalIds} member IDs, ${totalLinks} department links.`);
await db.$disconnect();
