/**
 * Levies against the REAL database, inside throwaway hidden test churches. Written for later use; do not run casually.
 *   npx tsx scripts/qa/levies-db.qa.ts
 *
 * Safety:
 *  - It creates its own churches with a "zz-qa-levies-" slug and marks them Church.isInternal = true (that column comes
 *    from another branch). If the column is missing, or the church does not read back as internal, it stops before
 *    writing anything else.
 *  - assertQa() re-reads the church before every step that writes, and before cleanup.
 *  - Every write is scoped to those church ids. Cleanup in `finally` deletes only the churches it created; everything
 *    else (gifts, levies, expenses, accounts) cascades with them.
 *  - Imports nothing that is "server-only" or uses "@/lib/db": the engine takes this script's own Prisma client.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  ensureRecords, recalcOpen, checkDrift, insertPayment, removePayment, acceptDrift, closeRecords, effectiveFromProblem, loadDailyIncome, EXPENSE_CATEGORY,
} from "../../src/lib/levies/engine";
import { toCents, fromCents } from "../../src/lib/levies/money";
import { createCollectionGifts, cleanCollectionLines } from "../../src/lib/giving/collection";
import { DEFAULT_PLAN_TABLE, planHasFeature } from "../../src/lib/plan-gate";
import { zonedToUtc } from "../../src/lib/time/tz";

const db = new PrismaClient();
const STAMP = Date.now();
const SLUG = `zz-qa-levies-${STAMP}`;
const CHILD_SLUG = `zz-qa-levies-child-${STAMP}`;
const created: string[] = [];
const results: { name: string; ok: boolean; note?: string }[] = [];

async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok  ${name}`); }
  catch (e) { results.push({ name, ok: false, note: (e as Error).message }); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

/** Throws unless this id is one of our own hidden zz-qa- churches. */
async function assertQa(id: string) {
  if (!created.includes(id)) throw new Error(`Refusing: ${id} was not created by this script.`);
  const rows = await db.$queryRaw<{ slug: string; isInternal: boolean }[]>`SELECT "slug", "isInternal" FROM "Church" WHERE "id" = ${id}`;
  const c = rows[0];
  if (!c || !c.slug.startsWith("zz-qa-") || c.isInternal !== true) throw new Error(`Refusing: church ${id} is not a hidden zz-qa- test church.`);
}

async function makeChurch(slug: string, name: string, extra: { parentChurchId?: string; linkShare?: string[] } = {}) {
  if (!slug.startsWith("zz-qa-")) throw new Error("Refusing: test slugs must start with zz-qa-.");
  if (await db.church.findUnique({ where: { slug }, select: { id: true } })) throw new Error(`Refusing: a church with slug ${slug} already exists.`);
  const c = await db.church.create({ data: { slug, name, isDemo: false, timezone: "Africa/Accra", ...extra }, select: { id: true } });
  created.push(c.id);
  // The hidden flag lives on another branch. Without it, stop: the church would show up in real stats and lists.
  try {
    await db.$executeRaw`UPDATE "Church" SET "isInternal" = true WHERE "id" = ${c.id}`;
    await assertQa(c.id);
  } catch (e) {
    // Remove the church just made (nothing else was written to it) and stop.
    await db.church.deleteMany({ where: { id: c.id, slug } });
    created.splice(created.indexOf(c.id), 1);
    throw new Error(`Refusing to run: the church could not be marked hidden (Church.isInternal). ${(e as Error).message}`);
  }
  return c.id;
}

const at = (ymd: string, hm = "12:00") => zonedToUtc(ymd, hm, "Africa/Accra");
const money = (d: { toString(): string } | null | undefined) => fromCents(toCents(d?.toString() ?? "0"));

async function main() {
  console.log(`levies-db (church ${SLUG})`);
  const churchId = await makeChurch(SLUG, "ZZ QA Levies");
  const now = at("2026-12-20");
  const tz = "Africa/Accra";

  // ── Setup ──
  await assertQa(churchId);
  await db.subscription.create({ data: { churchId, plan: "pro", status: "active" } });
  const [tithes, offertory] = await Promise.all([
    db.fund.create({ data: { churchId, name: "Tithes" } }),
    db.fund.create({ data: { churchId, name: "Offertory" } }),
  ]);
  const [bank, momo] = await Promise.all([
    db.churchAccount.create({ data: { churchId, name: "QA Bank", type: "bank", isDefault: true } }),
    db.churchAccount.create({ data: { churchId, name: "QA MoMo", type: "mobile-money" } }),
  ]);
  await db.gift.createMany({
    data: [
      { churchId, fundId: tithes.id, amount: "10000.00", date: at("2026-10-05"), donorName: "QA" },
      { churchId, fundId: tithes.id, amount: "2400.00", date: at("2026-10-31", "23:30"), donorName: "QA" },
      { churchId, fundId: tithes.id, amount: "5000.00", date: at("2026-11-01", "00:30"), donorName: "QA" },
      { churchId, fundId: offertory.id, amount: "3000.00", date: at("2026-11-08"), donorName: "QA" },
    ],
  });
  await db.transaction.createMany({
    data: [
      { churchId, description: "Harvest", category: "Harvest", fund: "Harvest", amount: "500.00", date: at("2026-11-10") },
      { churchId, description: "Correction: harvest", category: "Harvest", fund: "Harvest", amount: "-100.00", date: at("2026-11-12") },
      { churchId, description: "Transfer to MoMo", category: "Transfer", amount: "-1000.00", accountId: bank.id, date: at("2026-11-15") },
      { churchId, description: "Transfer from bank", category: "Transfer", amount: "1000.00", accountId: momo.id, date: at("2026-11-15") },
    ],
  });
  const rule = await db.levyRule.create({
    data: {
      churchId, name: "Head office share", payee: "Head office", frequency: "monthly", dueDays: 15, startsOn: at("2026-10-01", "00:00"),
      versions: { create: [{ churchId, effectiveFrom: at("2026-10-01", "00:00"), kind: "percent", rate: "10.0000", sources: [`fund:${tithes.id}`, "ledger:Harvest"] }] },
    },
  });

  // 1
  await step("ensureRecords creates Oct, Nov, Dec once (idempotent)", async () => {
    await assertQa(churchId);
    await ensureRecords(db, churchId, now);
    await ensureRecords(db, churchId, now);
    const keys = (await db.levyRecord.findMany({ where: { ruleId: rule.id }, select: { periodKey: true }, orderBy: { periodKey: "asc" } })).map((r) => r.periodKey);
    assert.deepEqual(keys, ["2026-10", "2026-11", "2026-12"]);
  });

  // 2
  await step("recalcOpen matches hand figures; transfers ignored; Harvest net 400", async () => {
    await assertQa(churchId);
    await recalcOpen(db, churchId, { now });
    const recs = await db.levyRecord.findMany({ where: { ruleId: rule.id }, orderBy: { periodKey: "asc" } });
    assert.equal(money(recs[0].calculated), "1240.00"); // 10% of 12,400 (the 23:30 gift is still 31 Oct in Accra)
    assert.equal(money(recs[1].calculated), "540.00"); // 10% of 5,000 tithes + 10% of 400 harvest net
    const income = await loadDailyIncome(db, churchId, at("2026-11-01", "00:00"), at("2026-12-01", "00:00"), tz);
    assert.ok(![...income.keys()].some((k) => k.includes("Transfer")));
  });

  // 3
  await step("insertPayment with expense: one expense, amountPaid set, auto-closes when fully paid", async () => {
    await assertQa(churchId);
    const oct = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-10" } });
    const r = await insertPayment(db, {
      churchId, recordId: oct.id, amountCents: toCents("1240.00"), paidOn: at("2026-11-14"), method: "bank", reference: "QA-1", accountId: bank.id,
      createExpense: true, expense: { description: "Head office share, October 2026", vendor: "Head office" }, note: null, by: { id: null, name: "QA" }, autoClose: true, tz, now,
    });
    const exp = await db.expense.findMany({ where: { churchId, category: EXPENSE_CATEGORY } });
    assert.equal(exp.length, 1);
    assert.equal(exp[0].accountId, bank.id);
    assert.equal(exp[0].amount, 1240);
    const after = await db.levyRecord.findUniqueOrThrow({ where: { id: oct.id } });
    assert.equal(money(after.amountPaid), "1240.00");
    assert.equal(after.state, "closed");
    assert.ok(r.closed);
  });

  // 4
  await step("two payments at the same time: amountPaid is the sum of both", async () => {
    await assertQa(churchId);
    const nov = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-11" } });
    const base = { churchId, recordId: nov.id, paidOn: at("2026-12-02"), method: "momo", reference: null, accountId: momo.id, createExpense: false, note: null, by: { id: null, name: "QA" }, autoClose: false, tz, now };
    await Promise.all([insertPayment(db, { ...base, amountCents: toCents("100.00") }), insertPayment(db, { ...base, amountCents: toCents("150.00") })]);
    const after = await db.levyRecord.findUniqueOrThrow({ where: { id: nov.id } });
    assert.equal(money(after.amountPaid), "250.00");
  });

  // 5
  await step("closed period untouched by recalc; drift reported exactly; carry clears it", async () => {
    await assertQa(churchId);
    const oct = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-10" } });
    await db.gift.create({ data: { churchId, fundId: tithes.id, amount: "300.00", date: at("2026-10-20"), donorName: "QA late" } });
    await recalcOpen(db, churchId, { now });
    const still = await db.levyRecord.findUniqueOrThrow({ where: { id: oct.id } });
    assert.equal(money(still.calculated), "1240.00");
    await checkDrift(db, churchId, now);
    const drifted = await db.levyRecord.findUniqueOrThrow({ where: { id: oct.id } });
    assert.equal(money(drifted.driftAmount), "30.00");
    const r = await acceptDrift(db, { churchId, recordId: oct.id, mode: "carry", reason: "QA", by: { id: null, name: "QA" } });
    assert.equal(fromCents(r.carried), "30.00");
    await checkDrift(db, churchId, now);
    const cleared = await db.levyRecord.findUniqueOrThrow({ where: { id: oct.id } });
    assert.equal(money(cleared.driftAmount), "0.00");
    const nov = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-11" } });
    assert.equal(money(nov.adjustments), "30.00");
  });

  // 6
  await step("a new version inside the closed period is refused", async () => {
    await assertQa(churchId);
    assert.ok(await effectiveFromProblem(db, churchId, rule.id, "2026-10-15", tz));
    assert.equal(await effectiveFromProblem(db, churchId, rule.id, "2026-11-01", tz), null);
  });

  // 7
  await step("deleting a gift in an open period lowers the levy on recalc", async () => {
    await assertQa(churchId);
    const g = await db.gift.create({ data: { churchId, fundId: tithes.id, amount: "1000.00", date: at("2026-11-20"), donorName: "QA temp" } });
    await recalcOpen(db, churchId, { now });
    const up = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-11" } });
    await db.gift.deleteMany({ where: { id: g.id, churchId } });
    await recalcOpen(db, churchId, { now });
    const down = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-11" } });
    assert.equal(fromCents(toCents(up.calculated.toString()) - toCents(down.calculated.toString())), "100.00");
  });

  // 8
  await step("removePayment deletes the linked expense and restores the balance", async () => {
    await assertQa(churchId);
    const pay = await db.levyPayment.findFirstOrThrow({ where: { churchId, expenseId: { not: null } } });
    await removePayment(db, churchId, pay.id);
    assert.equal(await db.expense.count({ where: { id: pay.expenseId! } }), 0);
    const rec = await db.levyRecord.findUniqueOrThrow({ where: { id: pay.recordId } });
    assert.equal(money(rec.amountPaid), "0.00");
  });

  // 9
  // Service income is a view of Giving: money is recorded once in Giving (linked to a service, or linked later).
  await step("giving linked to a service counts once in an offertory levy, before and after linking", async () => {
    await assertQa(churchId);
    const off = await db.levyRule.create({
      data: { churchId, name: "District offering share", payee: "District", startsOn: at("2026-12-01", "00:00"),
        versions: { create: [{ churchId, effectiveFrom: at("2026-12-01", "00:00"), kind: "percent", rate: "5.0000", sources: [`fund:${offertory.id}`] }] } },
    });
    const sheet = await db.serviceIncome.create({ data: { churchId, date: at("2026-12-06"), serviceName: "Sunday 1st service" } });
    // Recorded in Giving with "Which service?" = Sunday 1st service.
    await createCollectionGifts(db, churchId, {
      fundId: offertory.id, fundName: "Offertory", date: at("2026-12-06"), note: "Sunday 1st service", serviceIncomeId: sheet.id,
      lines: cleanCollectionLines([{ method: "Cash", amount: 600, notBanked: true }, { method: "MTN_MoMo", amount: 400, accountId: momo.id }]),
      resolveAccount: async (chosen) => chosen,
    });
    // Recorded in Giving as "Not linked to a service".
    const later = await createCollectionGifts(db, churchId, {
      fundId: offertory.id, fundName: "Offertory", date: at("2026-12-06"), serviceIncomeId: null,
      lines: cleanCollectionLines([{ method: "Cash", amount: 200, notBanked: true }]),
      resolveAccount: async (chosen) => chosen,
    });
    await ensureRecords(db, churchId, now);
    await recalcOpen(db, churchId, { now, ruleIds: [off.id] });
    const before = await db.levyRecord.findFirstOrThrow({ where: { ruleId: off.id, periodKey: "2026-12" } });
    assert.equal(money(before.calculated), "60.00");
    // "Link to service" on the Service income page only points the gifts at the service (as linkGiftsToService does).
    await db.gift.updateMany({ where: { id: { in: later.ids }, churchId, serviceIncomeId: null }, data: { serviceIncomeId: sheet.id } });
    await recalcOpen(db, churchId, { now, ruleIds: [off.id] });
    const after = await db.levyRecord.findFirstOrThrow({ where: { ruleId: off.id, periodKey: "2026-12" } });
    assert.equal(money(after.calculated), "60.00");
    const total = await db.gift.aggregate({ where: { churchId, serviceIncomeId: sheet.id }, _sum: { amount: true } });
    assert.equal(money(total._sum.amount), "1200.00");
    assert.equal(await db.gift.count({ where: { churchId, fundId: offertory.id, date: { gte: at("2026-12-06", "00:00"), lt: at("2026-12-07", "00:00") } } }), 3);
  });

  // 10
  await step("linked churches: nothing without consent; with it, only levies payable to the parent", async () => {
    await assertQa(churchId);
    const childId = await makeChurch(CHILD_SLUG, "ZZ QA Levies Child", { parentChurchId: churchId, linkShare: [] });
    await db.levyRule.create({ data: { churchId: childId, name: "To parent", payee: "ZZ QA Levies", payeeChurchId: churchId, startsOn: at("2026-12-01", "00:00"), versions: { create: [{ churchId: childId, effectiveFrom: at("2026-12-01", "00:00"), kind: "fixed", fixedAmount: "200.00" }] } } });
    await db.levyRule.create({ data: { churchId: childId, name: "To someone else", payee: "Mission", startsOn: at("2026-12-01", "00:00"), versions: { create: [{ churchId: childId, effectiveFrom: at("2026-12-01", "00:00"), kind: "fixed", fixedAmount: "50.00" }] } } });
    await ensureRecords(db, childId, now);
    const visible = async () => {
      const kids = await db.church.findMany({ where: { parentChurchId: churchId, linkShare: { has: "levies" } }, select: { id: true } });
      return db.levyRecord.findMany({ where: { churchId: { in: kids.map((k) => k.id) }, rule: { payeeChurchId: churchId } }, select: { rule: { select: { name: true } } } });
    };
    assert.equal((await visible()).length, 0);
    await assertQa(childId);
    await db.church.update({ where: { id: childId }, data: { linkShare: ["levies"] } });
    const v = await visible();
    assert.ok(v.length > 0 && v.every((r) => r.rule.name === "To parent"));
  });

  // 11
  await step("plan: levies is on Pro and Max only", async () => {
    assert.equal(planHasFeature("pro", "levies", DEFAULT_PLAN_TABLE), true);
    assert.equal(planHasFeature("starter", "levies", DEFAULT_PLAN_TABLE), false);
    assert.equal(planHasFeature("free", "service-income", DEFAULT_PLAN_TABLE), false);
  });

  // Closing a still-counting period is refused (bonus check on the guard the action relies on).
  await step("a period still counting cannot be closed", async () => {
    await assertQa(churchId);
    const dec = await db.levyRecord.findFirstOrThrow({ where: { ruleId: rule.id, periodKey: "2026-12" } });
    const r = await closeRecords(db, churchId, [dec.id], { id: null, name: "QA" }, now);
    assert.equal(r.closed, 0);
    assert.equal(r.stillCounting, 1);
  });
}

main()
  .catch((e) => { console.error("Stopped:", (e as Error).message); results.push({ name: "setup", ok: false, note: (e as Error).message }); })
  .finally(async () => {
    // Children first (they point at the parent), then the parent. Only churches this script made, and only if still hidden test churches.
    for (const id of [...created].reverse()) {
      try { await assertQa(id); await db.church.delete({ where: { id } }); }
      catch (e) { console.error(`Cleanup skipped for ${id}: ${(e as Error).message}`); }
    }
    await db.$disconnect();
    console.log("\nResult");
    for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
  });
