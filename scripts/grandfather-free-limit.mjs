// One-off: before lowering the Free plan's member limit (SuperAdmin → Plans → Free), protect churches that are
// already past the new limit. Any church on the Free plan with THRESHOLD or more members gets a personal cap of
// OLD_LIMIT; everyone below THRESHOLD simply follows the new, lower plan limit.
//
//   Preview (changes nothing):  node --env-file=.env scripts/grandfather-free-limit.mjs
//   Apply:                      node --env-file=.env scripts/grandfather-free-limit.mjs --apply
//
// Safe to re-run: churches that already have a cap are skipped. Members are counted the way the app counts them
// (everyone in People except visitors). Visitors never use a member place.
import { PrismaClient } from "@prisma/client";

const THRESHOLD = 30; // already at/above this many members → keep the old limit
const OLD_LIMIT = 40; // the Free limit being replaced
const apply = process.argv.includes("--apply");
const db = new PrismaClient();

const churches = await db.church.findMany({
  select: { id: true, name: true, freeMemberLimit: true, subscription: { select: { plan: true } } },
  orderBy: { name: "asc" },
});

const rows = [];
for (const c of churches) {
  const plan = c.subscription?.plan ?? "free";
  if (plan !== "free") continue;
  const members = await db.person.count({ where: { churchId: c.id, status: { not: "visitor" } } });
  const action = c.freeMemberLimit != null ? "already set" : members >= THRESHOLD ? `grandfather → ${OLD_LIMIT}` : "follows new limit";
  rows.push({ church: c.name, members, action });
  if (apply && c.freeMemberLimit == null && members >= THRESHOLD) {
    await db.church.update({ where: { id: c.id }, data: { freeMemberLimit: OLD_LIMIT } });
  }
}

console.table(rows);
const n = rows.filter((r) => r.action.startsWith("grandfather")).length;
console.log(apply ? `Done. ${n} church(es) now keep a cap of ${OLD_LIMIT}.` : `Preview only. ${n} church(es) would keep a cap of ${OLD_LIMIT}. Re-run with --apply to save.`);
await db.$disconnect();
