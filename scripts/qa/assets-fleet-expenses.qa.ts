/**
 * DATABASE checks for assets, vehicles, maintenance and expense approvals.
 *
 * NOT RUN YET. The database is production, so this only ever works inside a hidden internal QA church:
 *   - Church.isInternal must be true (column added on another branch) AND its slug must start with "zz-qa-".
 *   - Anything else and the script refuses before writing a single row.
 * Everything it creates is removed in `finally`, and the cleanup is checked (counts back to zero).
 *
 * Run (after sql/assets-fleet-expenses.sql has been applied):
 *   QA_CHURCH_SLUG=zz-qa-xxx [QA_CHURCH_B_SLUG=zz-qa-yyy] npx tsx -r ./scripts/qa/preload.cjs scripts/qa/assets-fleet-expenses.qa.ts
 * The second church is optional; without it the cross-church (tenant isolation) checks are skipped.
 * No texts or emails are sent: services are called directly, and the alert runner gets a fake mailer.
 */
import { db } from "../../src/lib/db";
import { ownedId } from "../../src/lib/tenant";
import { postExpense, type Ctx } from "../../src/lib/expenses/post";
import { createRequest, decideRequest, payRequest } from "../../src/lib/expenses/requests";
import { recordRecurring } from "../../src/lib/expenses/recurring";
import { saveAsset, checkOut, checkIn, dispose } from "../../src/lib/assets/service";
import { saveVehicle, logFuel, startTrip, endTrip } from "../../src/lib/fleet/service";
import { assetSummary } from "../../src/lib/data/assets";
import { budgetUsage } from "../../src/lib/data/expenses";
import { buildAssetAlerts, claimAssetAlertDay } from "../../src/lib/data/asset-alerts";
import { getLedger, parseLedgerParams } from "../../src/lib/data/ledger";
import { moveToBin } from "../../src/lib/recycle-bin";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, info?: unknown) {
  if (ok) passed++; else { failed++; console.error(`FAIL ${name}`, info ?? ""); }
}

async function internalChurch(slug: string | undefined) {
  if (!slug || !slug.startsWith("zz-qa-")) throw new Error(`Refusing: slug "${slug}" does not start with zz-qa-.`);
  const rows = await db.$queryRaw<{ id: string; slug: string; isInternal: boolean | null }[]>`SELECT "id", "slug", "isInternal" FROM "Church" WHERE "slug" = ${slug} LIMIT 1`;
  const c = rows[0];
  if (!c) throw new Error(`Refusing: no church with slug ${slug}.`);
  if (c.isInternal !== true) throw new Error(`Refusing: church ${slug} is not marked isInternal.`);
  return c.id;
}

const day = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const A = await internalChurch(process.env.QA_CHURCH_SLUG);
  const B = process.env.QA_CHURCH_B_SLUG ? await internalChurch(process.env.QA_CHURCH_B_SLUG) : null;
  const start = new Date(Date.now() - 1000);
  const before = await db.church.findMany({ where: { id: { in: [A, ...(B ? [B] : [])] } }, select: { id: true, assetTagSeq: true, assetAlertsSent: true } });
  const owner = await db.user.findFirst({ where: { churchId: A, role: "Owner" }, select: { id: true, name: true } });
  const other = await db.user.findFirst({ where: { churchId: A, role: { not: "Owner" } }, select: { id: true, name: true } });
  if (!owner) throw new Error("The QA church needs an Owner user.");
  const ctx: Ctx = { churchId: A, userId: owner.id, name: owner.name, canPostExpenses: true, fundAccounting: true, budgetsOn: true, isOwner: true };
  const noPost: Ctx = { ...ctx, canPostExpenses: false };
  const made = { accounts: [] as string[], funds: [] as string[], gifts: [] as string[], budgets: [] as string[], people: [] as string[], txns: [] as string[] };

  try {
    const account = await db.churchAccount.create({ data: { churchId: A, name: `QA account ${Date.now()}` }, select: { id: true } });
    made.accounts.push(account.id);

    // 5. Tags: 10 at once, no duplicates, sequence moves by 10.
    const seq0 = before.find((c) => c.id === A)!.assetTagSeq;
    const ten = await Promise.all(Array.from({ length: 10 }, (_, i) => saveAsset(ctx, { name: `QA chair ${i}` })));
    const tags = await db.asset.findMany({ where: { id: { in: ten.filter((r) => r.ok).map((r) => (r as { id: string }).id) } }, select: { tagCode: true } });
    check("10 assets saved", ten.every((r) => r.ok));
    check("tags unique", new Set(tags.map((t) => t.tagCode)).size === 10, tags);
    const seq1 = (await db.church.findUnique({ where: { id: A }, select: { assetTagSeq: true } }))!.assetTagSeq;
    check("sequence +10", seq1 === seq0 + 10, { seq0, seq1 });

    // 6. Vehicle = asset + vehicle; duplicate plate refused in the same church, allowed in another.
    const reg = `QA ${Date.now() % 100000}-26`;
    const v1 = await saveVehicle(ctx, { regNumber: reg, make: "Toyota", model: "Coaster", odometerKm: 50000 });
    check("vehicle saved", v1.ok, v1);
    const vehicle = v1.ok ? await db.vehicle.findUnique({ where: { id: v1.id }, include: { asset: true } }) : null;
    check("asset category vehicle", vehicle?.asset.category === "vehicle");
    const dup = await saveVehicle(ctx, { regNumber: reg.toLowerCase() });
    check("duplicate plate refused", !dup.ok);
    let bVehicleId: string | null = null;
    if (B) {
      const bOwner = await db.user.findFirst({ where: { churchId: B, role: "Owner" }, select: { id: true, name: true } });
      const bctx: Ctx = { ...ctx, churchId: B, userId: bOwner?.id ?? owner.id, name: bOwner?.name ?? "QA" };
      const vb = await saveVehicle(bctx, { regNumber: reg });
      check("same plate in church B allowed", vb.ok, vb);
      bVehicleId = vb.ok ? vb.id : null;
    }

    // 7. Tenant isolation.
    if (B && bVehicleId) {
      const before7 = await db.vehicleFuel.count({ where: { vehicleId: bVehicleId } });
      const r = await logFuel(ctx, { vehicleId: bVehicleId, litres: 10, cost: 100, record: true });
      check("fuel on B vehicle refused", !r.ok);
      check("no B fuel row", (await db.vehicleFuel.count({ where: { vehicleId: bVehicleId } })) === before7);
      check("ownedId across churches is null", (await ownedId("vehicle", bVehicleId, A)) === null);
      const bPerson = await db.person.create({ data: { churchId: B, firstName: "QA", lastName: "Outsider" }, select: { id: true } });
      made.people.push(bPerson.id);
      const co = await checkOut(ctx, { assetId: (ten[0] as { id: string }).id, personId: bPerson.id });
      check("checkout to B person refused", !co.ok);
      const bBudget = await db.budget.create({ data: { churchId: B, name: "QA B budget", year: 2026, items: { create: { churchId: B, category: "x", description: "B line", amount: 100 } } }, include: { items: true } });
      made.budgets.push(bBudget.id);
      const ex = await postExpense(ctx, { description: "QA cross budget", amount: 5, budgetItemId: bBudget.items[0].id });
      check("expense on B budget line refused", !ex.ok);
    }

    // 8. Fuel posting: expense or request.
    if (vehicle) {
      const f1 = await logFuel(ctx, { vehicleId: vehicle.id, litres: 40, cost: 600, odometer: 50100, record: true, accountId: account.id });
      check("fuel posted", f1.ok && f1.posted === "expense", f1);
      if (f1.ok) {
        const fuel = await db.vehicleFuel.findUnique({ where: { id: f1.id } });
        const exp = fuel?.expenseId ? await db.expense.findUnique({ where: { id: fuel.expenseId } }) : null;
        check("fuel linked to expense", !!exp && exp.source === "fuel" && exp.assetId === vehicle.assetId, exp);
        const ledger = await getLedger(A, parseLedgerParams({ p: "all" }).period, { ...parseLedgerParams({}).filters, source: "expense", group: false });
        check("ledger has fuel expense", ledger.totals.count > 0 && (ledger.totals.expenses >= 600));
      }
      const f2 = await logFuel(noPost, { vehicleId: vehicle.id, litres: 20, cost: 300, odometer: 50200, record: true });
      check("fuel without rights -> request", f2.ok && f2.posted === "request", f2);
      if (f2.ok) {
        const req = await db.expenseRequest.findFirst({ where: { churchId: A, source: "fuel", sourceId: f2.id } });
        check("pending fuel request", req?.status === "pending");
        check("no expense for that fuel", !(await db.vehicleFuel.findUnique({ where: { id: f2.id } }))?.expenseId);
      }

      // 10. Odometer.
      const low = await logFuel(ctx, { vehicleId: vehicle.id, litres: 5, cost: 50, odometer: 49000 });
      check("lower odometer refused", !low.ok && /lower than the last one/.test((low as { error: string }).error));
      const t = await startTrip(ctx, { vehicleId: vehicle.id, odometerStart: 50200, purpose: "errand" });
      check("trip started", t.ok, t);
      if (t.ok) {
        const bad = await endTrip(ctx, t.id, { odometerEnd: 50100 });
        check("end below start refused", !bad.ok);
        const good = await endTrip(ctx, t.id, { odometerEnd: 50320 });
        check("trip ended", good.ok);
        check("odometer moved", (await db.vehicle.findUnique({ where: { id: vehicle.id } }))?.odometerKm === 50320);
      }

      // 9. Restricted fund: blocked, and neither row exists.
      const fund = await db.fund.create({ data: { churchId: A, name: `QA restricted ${Date.now()}`, restricted: true }, select: { id: true } });
      made.funds.push(fund.id);
      const gift = await db.gift.create({ data: { churchId: A, fundId: fund.id, amount: 100, donorName: "QA" }, select: { id: true } });
      made.gifts.push(gift.id);
      const fuelBefore = await db.vehicleFuel.count({ where: { vehicleId: vehicle.id } });
      const blocked = await logFuel(ctx, { vehicleId: vehicle.id, litres: 10, cost: 150, record: true, fundId: fund.id });
      check("restricted fund blocks fuel", !blocked.ok, blocked);
      check("no fuel row after block", (await db.vehicleFuel.count({ where: { vehicleId: vehicle.id } })) === fuelBefore);
      check("no expense on fund", (await db.expense.count({ where: { fundId: fund.id } })) === 0);
    }

    // 11. Approvals: parallel pay gives one expense; own approval refused for non-owner; rejected cannot be paid.
    const r1 = await createRequest(ctx, { description: "QA chairs", amount: 250 });
    check("request created", r1.ok);
    if (r1.ok) {
      check("approved", (await decideRequest(ctx, r1.id, "approve")).ok);
      const pays = await Promise.all([payRequest(ctx, r1.id), payRequest(ctx, r1.id)]);
      check("exactly one pay succeeded", pays.filter((p) => p.ok).length === 1, pays);
      const reqRow = await db.expenseRequest.findUnique({ where: { id: r1.id } });
      check("request paid", reqRow?.status === "paid" && !!reqRow.expenseId);
      check("one expense for it", (await db.expense.count({ where: { churchId: A, sourceId: r1.id, source: "request" } })) === 1);
    }
    if (other) {
      const octx: Ctx = { ...ctx, userId: other.id, name: other.name, isOwner: false };
      const own = await createRequest(octx, { description: "QA mine", amount: 10 });
      if (own.ok) check("own approval refused", !(await decideRequest(octx, own.id, "approve")).ok);
    }
    const r2 = await createRequest(ctx, { description: "QA no", amount: 20 });
    if (r2.ok) {
      await decideRequest(ctx, r2.id, "reject", "Not this month");
      check("rejected cannot be paid", !(await payRequest(ctx, r2.id)).ok);
    }

    // 12. Recurring: two at once record once.
    const due = new Date(Date.UTC(2026, 0, 31));
    const rec = await db.recurringExpense.create({ data: { churchId: A, description: "QA rent", amount: 1200, frequency: "monthly", anchorDay: 31, nextDue: due } });
    const recs = await Promise.all([recordRecurring(ctx, rec.id), recordRecurring(ctx, rec.id)]);
    check("one recurring record", recs.filter((r) => r.ok).length === 1, recs);
    check("nextDue moved once", ymd((await db.recurringExpense.findUnique({ where: { id: rec.id } }))!.nextDue) === "2026-02-28");

    // 13. Budget: linked spend counted, no BudgetEntry or Transaction created.
    const budget = await db.budget.create({ data: { churchId: A, name: "QA budget", year: new Date().getUTCFullYear(), total: 1000, items: { create: [{ churchId: A, category: "x", description: "Line 1", amount: 600 }] } }, include: { items: true } });
    made.budgets.push(budget.id);
    const other2 = await db.budget.create({ data: { churchId: A, name: "QA budget 2", year: 2026, items: { create: [{ churchId: A, category: "y", description: "Other line", amount: 10 }] } }, include: { items: true } });
    made.budgets.push(other2.id);
    const wrong = await postExpense(ctx, { description: "QA wrong line", amount: 5, budgetId: budget.id, budgetItemId: other2.items[0].id });
    check("line from another budget refused", !wrong.ok);
    const entries0 = await db.budgetEntry.count({ where: { churchId: A } });
    const txns0 = await db.transaction.count({ where: { churchId: A } });
    await db.budgetEntry.create({ data: { churchId: A, budgetId: budget.id, type: "expense", description: "QA entry", amount: 50 } });
    const linked = await postExpense(ctx, { description: "QA linked", amount: 120, budgetItemId: budget.items[0].id });
    check("linked expense ok", linked.ok);
    const usage = (await budgetUsage(A, budget.year)).find((b) => b.id === budget.id);
    check("budget used = entry + linked", usage?.used === 170, usage);
    check("line used = linked", usage?.items[0].used === 120, usage);
    check("no extra BudgetEntry", (await db.budgetEntry.count({ where: { churchId: A } })) === entries0 + 1);
    check("no Transaction from expenses", (await db.transaction.count({ where: { churchId: A } })) === txns0);

    // 14. Asset lifecycle.
    const mic = await saveAsset(ctx, { name: "QA wireless mic", purchasePrice: 3000, purchaseDate: new Date("2025-01-01") });
    if (mic.ok) {
      const p = await db.person.create({ data: { churchId: A, firstName: "QA", lastName: "Borrower" }, select: { id: true } });
      made.people.push(p.id);
      check("checked out", (await checkOut(ctx, { assetId: mic.id, personId: p.id, dueAt: new Date(Date.now() + day) })).ok);
      check("second checkout refused", !(await checkOut(ctx, { assetId: mic.id, borrowerName: "Someone" })).ok);
      check("checked in", (await checkIn(ctx, mic.id, "good")).ok);
      const s0 = await assetSummary(A);
      const d = await dispose(ctx, { assetId: mic.id, method: "sold", amount: 2500, accountId: account.id });
      check("disposed", d.ok);
      const a = await db.asset.findUnique({ where: { id: mic.id } });
      check("status disposed + txn", a?.status === "disposed" && !!a.disposalTxnId);
      if (a?.disposalTxnId) { made.txns.push(a.disposalTxnId); check("sale income", Number((await db.transaction.findUnique({ where: { id: a.disposalTxnId } }))?.amount) === 2500); }
      const s1 = await assetSummary(A);
      check("summary leaves disposed out", Math.abs(s0.cost - s1.cost - 3000) < 0.01, { before: s0.cost, after: s1.cost });
    }

    // 15. Alerts: threshold days, Mondays only for overdue, one claim per day.
    if (vehicle) {
      const monday = new Date("2026-11-16T09:00:00Z"); // a Monday
      const tuesday = new Date("2026-11-17T09:00:00Z");
      await db.vehicle.update({ where: { id: vehicle.id }, data: { insuranceExpires: new Date(Date.UTC(2026, 10, 23)), roadworthyExpires: new Date(Date.UTC(2026, 10, 24)), registrationExpires: new Date(Date.UTC(2026, 10, 1)) } });
      const mon = await buildAssetAlerts(A, monday, "Africa/Accra");
      check("insurance in 7 days alerted", mon.items.some((i) => i.text.includes("insurance ends in 7 days")), mon.items);
      check("roadworthy in 8 days not alerted", !mon.items.some((i) => i.text.includes("roadworthy")), mon.items);
      check("overdue on Monday", mon.items.some((i) => i.text.includes("DVLA renewal ran out")));
      const tue = await buildAssetAlerts(A, tuesday, "Africa/Accra");
      check("overdue not on Tuesday", !tue.items.some((i) => i.text.includes("DVLA renewal ran out")));
      check("first claim", await claimAssetAlertDay(A, "2099-01-01"));
      check("second claim same day refused", !(await claimAssetAlertDay(A, "2099-01-01")));
    }

    // 16. Delete safety: fuel and its expense both go to the bin; deleting the vehicle snapshots its children.
    if (vehicle) {
      const f = await db.vehicleFuel.findFirst({ where: { vehicleId: vehicle.id, expenseId: { not: null } } });
      if (f) {
        const sess = { churchId: A, userId: owner.id, name: owner.name };
        await moveToBin(sess, "vehicleFuel", "VehicleFuel", f.id);
        await moveToBin(sess, "expense", "Expense", f.expenseId!);
        check("fuel in bin", (await db.deletedItem.count({ where: { churchId: A, entityId: f.id } })) === 1);
        check("expense in bin", (await db.deletedItem.count({ where: { churchId: A, entityId: f.expenseId! } })) === 1);
      }
      await moveToBin({ churchId: A, userId: owner.id, name: owner.name }, "vehicle", "Asset", vehicle.assetId);
      const snap = await db.deletedItem.findFirst({ where: { churchId: A, entityId: vehicle.assetId }, select: { snapshot: true } });
      const models = ((snap?.snapshot as { nodes?: { model: string }[] })?.nodes ?? []).map((n) => n.model);
      check("vehicle snapshot has trips and fuel", ["Vehicle", "VehicleTrip", "VehicleFuel"].every((m) => models.includes(m)), models);
      await db.asset.delete({ where: { id: vehicle.assetId } });
      check("vehicle cascade", (await db.vehicleTrip.count({ where: { vehicleId: vehicle.id } })) === 0 && (await db.vehicleFuel.count({ where: { vehicleId: vehicle.id } })) === 0);
    }
  } finally {
    // Cleanup: assets cascade vehicles, trips, fuel, drivers, checkouts, documents, schedules and records.
    for (const c of [A, ...(B ? [B] : [])]) {
      const w = { churchId: c, createdAt: { gte: start } };
      await db.expenseRequest.deleteMany({ where: w });
      await db.recurringExpense.deleteMany({ where: w });
      await db.maintenanceRequest.deleteMany({ where: w });
      await db.expense.deleteMany({ where: w });
      await db.asset.deleteMany({ where: w });
      await db.vendor.deleteMany({ where: w });
      await db.deletedItem.deleteMany({ where: { churchId: c, deletedAt: { gte: start } } });
      await db.auditLog.deleteMany({ where: w });
      await db.budgetEntry.deleteMany({ where: w });
    }
    await db.transaction.deleteMany({ where: { id: { in: made.txns } } });
    await db.gift.deleteMany({ where: { id: { in: made.gifts } } });
    await db.fund.deleteMany({ where: { id: { in: made.funds } } });
    await db.budget.deleteMany({ where: { id: { in: made.budgets } } });
    await db.person.deleteMany({ where: { id: { in: made.people } } });
    await db.churchAccount.deleteMany({ where: { id: { in: made.accounts } } });
    for (const b of before) await db.church.update({ where: { id: b.id }, data: { assetTagSeq: b.assetTagSeq, assetAlertsSent: b.assetAlertsSent } });

    for (const c of [A, ...(B ? [B] : [])]) {
      const w = { churchId: c, createdAt: { gte: start } };
      const left = {
        asset: await db.asset.count({ where: w }), vehicle: await db.vehicle.count({ where: w }), vehicleTrip: await db.vehicleTrip.count({ where: w }),
        vehicleFuel: await db.vehicleFuel.count({ where: w }), expense: await db.expense.count({ where: w }), expenseRequest: await db.expenseRequest.count({ where: w }),
        recurringExpense: await db.recurringExpense.count({ where: w }), assetCheckout: await db.assetCheckout.count({ where: w }), maintenanceRecord: await db.maintenanceRecord.count({ where: w }),
      };
      const dirty = Object.entries(left).filter(([, n]) => n > 0);
      check(`cleanup complete for ${c}`, dirty.length === 0, dirty);
    }
    console.log(`${passed} passed, ${failed} failed`);
    await db.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
