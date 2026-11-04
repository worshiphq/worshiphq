// Trim the FREE signup SMS credits held by churches on the Free plan down to a cap.
//   node scripts/trim-free-credits.cjs            dry run: shows who would change and by how much
//   node scripts/trim-free-credits.cjs --apply    does it (each change is written to the church's SMS history)
//   node scripts/trim-free-credits.cjs --cap 30   change the cap (default 30)
//
// Only the FREE portion is ever touched. Credits a church bought, or that were gifted or granted by hand, are
// in the SMS ledger and are never removed: a church's protected amount is min(balance, its ledger total), and
// only what sits above that (the free signup credits, which have no ledger entry) can be trimmed. A church at or
// under the cap is left alone, and so is any church on a paid plan or a gifted plan.
//
// Its own history entries are NOT counted when working out what is protected. Each trim is written to the SMS
// ledger as a negative row, and counting that row would shrink the protected amount and make a second run trim
// credits the church actually bought. So the ledger total used here has those rows added back, and running the
// script again changes nothing.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const argCap = process.argv.indexOf("--cap");
const CAP = argCap > -1 ? Math.max(0, parseInt(process.argv[argCap + 1], 10) || 30) : 30;
const APPLY = process.argv.includes("--apply");
const NOTE = `Free signup credits adjusted to ${CAP}`;

(async () => {
  const db = new PrismaClient();
  try {
    const [churches, subs, ledger, trims] = await Promise.all([
      db.church.findMany({ where: { isDemo: false, smsCredits: { gt: CAP } }, select: { id: true, name: true, smsCredits: true } }),
      db.subscription.findMany({ select: { churchId: true, plan: true, status: true } }),
      db.smsTransaction.groupBy({ by: ["churchId"], _sum: { credits: true } }),
      db.smsTransaction.groupBy({ by: ["churchId"], where: { adminNote: { startsWith: "Free credits trimmed" } }, _sum: { credits: true } }),
    ]);
    const sub = new Map(subs.map((s) => [s.churchId, s]));
    const trimmed = new Map(trims.map((r) => [r.churchId, r._sum.credits ?? 0]));
    // Ledger total as if no trim had ever been written (the trim rows are negative, so subtracting adds them back).
    const led = new Map(ledger.map((r) => [r.churchId, (r._sum.credits ?? 0) - (trimmed.get(r.churchId) ?? 0)]));

    const changes = [];
    let skippedPaid = 0;
    for (const c of churches) {
      const s = sub.get(c.id);
      if (s && (s.plan !== "free" || s.status === "grace")) { skippedPaid++; continue; }
      const protectedCredits = Math.min(c.smsCredits, Math.max(0, led.get(c.id) ?? 0));
      const freePortion = c.smsCredits - protectedCredits;
      if (freePortion <= CAP) continue;
      const remove = freePortion - CAP;
      changes.push({ ...c, protectedCredits, freePortion, remove, after: c.smsCredits - remove });
    }

    const total = changes.reduce((t, c) => t + c.remove, 0);
    console.log(`Cap: ${CAP} free credits per church (only the free portion is trimmed).`);
    console.log(`Free-plan churches affected: ${changes.length}  |  credits removed: ${total}  |  paid or gifted plans skipped: ${skippedPaid}`);
    console.log(`Churches that also hold bought/gifted credits (kept whole): ${changes.filter((c) => c.protectedCredits > 0).length}`);
    for (const c of changes.sort((a, b) => b.remove - a.remove).slice(0, 8)) {
      console.log(`  ${c.name.slice(0, 34).padEnd(34)} ${String(c.smsCredits).padStart(5)} -> ${String(c.after).padStart(5)}  (protected ${c.protectedCredits})`);
    }

    if (!APPLY) { console.log("\nDry run only. Add --apply to do it."); return; }

    let done = 0;
    for (const c of changes) {
      // The balance is only lowered if it still holds what we read, so a church that spent credits a moment ago
      // is never pushed below zero and nothing is trimmed twice.
      const res = await db.church.updateMany({ where: { id: c.id, smsCredits: { gte: c.remove } }, data: { smsCredits: { decrement: c.remove } } });
      if (res.count !== 1) continue;
      const now = await db.church.findUnique({ where: { id: c.id }, select: { smsCredits: true } });
      await db.smsTransaction.create({
        data: { churchId: c.id, kind: "refund", credits: -c.remove, balanceAfter: now.smsCredits, note: NOTE, source: "manual", adminNote: `Free credits trimmed to ${CAP} (was ${c.smsCredits})` },
      });
      done++;
    }
    console.log(`\nApplied to ${done} churches.`);
  } finally {
    await db.$disconnect();
  }
})();
