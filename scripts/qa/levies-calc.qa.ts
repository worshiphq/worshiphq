/**
 * Pure tests for the levy calculator. No database, no server-only imports.
 *   npx tsx scripts/qa/levies-calc.qa.ts
 */
import assert from "node:assert/strict";
import { computeLevy, statusOf, retentionByStream, validateRates, allocateOldestFirst, driftOf, dueReminderMilestones, checkEffectiveFrom } from "../../src/lib/levies/calc";
import { explainLine, explainCap, statusText } from "../../src/lib/levies/explain";
import { toCents, fromCents, roundHalfUp, rateUnits, fmtGhs, RATE_DIV } from "../../src/lib/levies/money";
import { periodKeyFor, periodBoundsYmd, periodBounds, periodLabel, dueYmdFor, periodsBetween, nextPeriodStart } from "../../src/lib/levies/periods";
import { streamKeyForTxn, streamKeyForGift } from "../../src/lib/levies/streams";
import { ymdInTz } from "../../src/lib/time/tz";
import { LEVY_TEMPLATES, TEMPLATE_SETS } from "../../src/lib/levies/templates";
import type { DailyIncome, RuleInput, VersionInput } from "../../src/lib/levies/types";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

const c = (s: string) => toCents(s);
const NOV = { key: "2026-11", startYmd: "2026-11-01", endYmd: "2026-12-01" };
const label = (k: string) => ({ "fund:t": "Tithes", "fund:o": "Offertory", "ledger:Harvest": "Harvest" } as Record<string, string>)[k] ?? k;
function income(rows: [string, string, string][]): DailyIncome {
  const m: DailyIncome = new Map();
  for (const [k, d, a] of rows) {
    const days = m.get(k) ?? new Map<string, bigint>();
    days.set(d, (days.get(d) ?? BigInt(0)) + c(a));
    m.set(k, days);
  }
  return m;
}
const v = (p: Partial<VersionInput>): VersionInput => ({ id: "v1", fromYmd: "2026-01-01", kind: "percent", rate: 10, fixedAmount: null, allIncome: false, sources: ["fund:t"], minAmount: null, maxAmount: null, ...p });
const rule = (p: Partial<RuleInput>): RuleInput => ({ id: "r1", name: "Head Office share", startsYmd: "2026-01-01", endsYmd: null, versions: [v({})], ...p });

console.log("levies-calc");

test("1 basic percent: 10% of 12,400.00 = 1,240.00 with exact text and no em dash", () => {
  const r = computeLevy({ period: NOV, rule: rule({}), income: income([["fund:t", "2026-11-03", "12400.00"]]), label });
  assert.equal(fromCents(r.calculatedCents), "1240.00");
  const text = explainLine(r.lines[0]);
  assert.equal(text, "10% of GH₵12,400.00 Tithes = GH₵1,240.00");
  assert.ok(!text.includes(String.fromCharCode(0x2014)));
});

test("2 rounding half up, per line, total = sum of rounded lines", () => {
  assert.equal(roundHalfUp(c("0.05") * rateUnits(10), RATE_DIV), BigInt(1)); // 0.005 -> 0.01
  assert.equal(fromCents(roundHalfUp(c("1234.56") * rateUnits("12.5"), RATE_DIV)), "154.32");
  // three lines of 0.05 at 10% each = 0.005 -> each rounds to 0.01, total 0.03 (not 0.02 from rounding the sum 0.015)
  const r = computeLevy({
    period: NOV,
    rule: rule({ versions: [v({ sources: ["fund:t", "fund:o", "ledger:Harvest"] })] }),
    income: income([["fund:t", "2026-11-02", "0.05"], ["fund:o", "2026-11-02", "0.05"], ["ledger:Harvest", "2026-11-02", "0.05"]]),
    label,
  });
  assert.equal(r.lines.length, 3);
  assert.ok(r.lines.every((l) => l.levyCents === BigInt(1)));
  assert.equal(r.calculatedCents, r.lines.reduce((s, l) => s + l.levyCents, BigInt(0)));
  assert.equal(fromCents(r.calculatedCents), "0.03");
});

test("3 BigInt safety: 99,999,999.99 x 100% is exact", () => {
  const r = computeLevy({ period: NOV, rule: rule({ versions: [v({ rate: 100 })] }), income: income([["fund:t", "2026-11-05", "99999999.99"]]), label });
  assert.equal(fromCents(r.calculatedCents), "99999999.99");
  assert.equal(fmtGhs(r.calculatedCents), "GH₵99,999,999.99");
});

test("4 rate change mid-month splits by income date", () => {
  const MAR = { key: "2026-03", startYmd: "2026-03-01", endYmd: "2026-04-01" };
  const r = computeLevy({
    period: MAR,
    rule: rule({ versions: [v({ id: "a", rate: 10 }), v({ id: "b", fromYmd: "2026-03-15", rate: 12 })] }),
    income: income([["fund:t", "2026-03-14", "1000.00"], ["fund:t", "2026-03-15", "2000.00"]]),
    label,
  });
  assert.equal(r.lines.length, 2);
  assert.equal(fromCents(r.lines[0].levyCents), "100.00");
  assert.equal(fromCents(r.lines[1].levyCents), "240.00");
  assert.equal(fromCents(r.calculatedCents), "340.00");
  assert.equal(explainLine(r.lines[0]), "10% of GH₵1,000.00 Tithes (1 to 14 Mar) = GH₵100.00");
  assert.equal(explainLine(r.lines[1]), "12% of GH₵2,000.00 Tithes (15 to 31 Mar) = GH₵240.00");
});

test("5 fixed levy: full per period, mid-period change applies next period, mid-period start waits", () => {
  const fixed = rule({ versions: [v({ kind: "fixed", rate: null, fixedAmount: "500.00", sources: [] })] });
  assert.equal(fromCents(computeLevy({ period: NOV, rule: fixed, income: new Map(), label }).calculatedCents), "500.00");
  const changed = rule({ versions: [v({ id: "a", kind: "fixed", fixedAmount: "500", sources: [] }), v({ id: "b", fromYmd: "2026-11-10", kind: "fixed", fixedAmount: "800", sources: [] })] });
  const nov = computeLevy({ period: NOV, rule: changed, income: new Map(), label });
  assert.equal(fromCents(nov.calculatedCents), "500.00");
  assert.ok(nov.warnings.some((w) => /next period/.test(w)));
  const dec = computeLevy({ period: { key: "2026-12", startYmd: "2026-12-01", endYmd: "2027-01-01" }, rule: changed, income: new Map(), label });
  assert.equal(fromCents(dec.calculatedCents), "800.00");
  const late = rule({ startsYmd: "2026-11-10", versions: [v({ fromYmd: "2026-11-10", kind: "fixed", fixedAmount: "500", sources: [] })] });
  const r = computeLevy({ period: NOV, rule: late, income: new Map(), label });
  assert.equal(r.calculatedCents, BigInt(0));
  assert.ok(r.warnings.some((w) => /1 December 2026/.test(w)), r.warnings.join(" | "));
  assert.equal(nextPeriodStart("2026-11-10", "monthly"), "2026-12-01");
});

test("6 quarterly and yearly keys with the year starting in October", () => {
  assert.equal(periodKeyFor("2026-11-15", "quarterly", 10), "2026-Q1");
  assert.equal(periodKeyFor("2027-01-02", "quarterly", 10), "2026-Q2");
  assert.equal(periodKeyFor("2026-09-30", "quarterly", 10), "2025-Q4");
  assert.deepEqual(periodBoundsYmd("2026-Q1", "quarterly", 10), { key: "2026-Q1", startYmd: "2026-10-01", endYmd: "2027-01-01" });
  assert.equal(periodLabel("2026-Q1", "quarterly", 10), "Oct to Dec 2026");
  assert.equal(periodLabel("2026-Q2", "quarterly", 11), "Feb to Apr 2027");
  assert.equal(periodKeyFor("2026-11-15", "yearly", 10), "2026");
  assert.deepEqual(periodBoundsYmd("2026", "yearly", 10), { key: "2026", startYmd: "2026-10-01", endYmd: "2027-10-01" });
  assert.equal(periodLabel("2026", "yearly", 10), "Year from Oct 2026");
  assert.equal(dueYmdFor("2027-01-01", 15), "2027-01-15");
  assert.equal(dueYmdFor("2026-12-01", 15), "2026-12-15");
  assert.equal(periodsBetween("2026-10-05", "2027-04-01", "quarterly", 10).map((p) => p.key).join(","), "2026-Q1,2026-Q2,2026-Q3");
  assert.equal(periodLabel("2026-11", "monthly"), "November 2026");
});

test("7 timezone: day buckets and period bounds use the church's zone", () => {
  assert.equal(ymdInTz(new Date("2026-10-31T23:30:00Z"), "America/New_York"), "2026-10-31");
  assert.equal(periodKeyFor(ymdInTz(new Date("2026-10-31T23:30:00Z"), "America/New_York"), "monthly"), "2026-10");
  assert.equal(periodKeyFor(ymdInTz(new Date("2026-11-01T00:30:00Z"), "Africa/Accra"), "monthly"), "2026-11");
  const b = periodBounds("2026-11", "monthly", 1, "America/New_York");
  assert.equal(b.start.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(b.end.toISOString(), "2026-12-01T05:00:00.000Z");
});

test("8 several rules on one stream: retention and the over-100% refusal", () => {
  const rules = [
    { id: "a", name: "A", version: v({ id: "a", rate: 10 }) },
    { id: "b", name: "B", version: v({ id: "b", rate: 5 }) },
  ];
  const r = retentionByStream(rules, ["fund:t"])[0];
  assert.equal(r.totalUnits, rateUnits(15));
  assert.equal(r.keepUnits, rateUnits(85));
  assert.equal(validateRates(rules, ["fund:t"]).length, 0);
  const bad = validateRates([{ id: "a", name: "A", version: v({ rate: 60 }) }, { id: "b", name: "B", version: v({ rate: 50 }) }], ["fund:t"]);
  assert.equal(bad.length, 1);
});

test("9 afterRule: 5% of what is left after 10%", () => {
  const first = rule({ id: "hq", name: "Head Office share" });
  const second = rule({ id: "d", name: "District", versions: [v({ id: "d1", rate: 5 })], after: first });
  const r = computeLevy({ period: NOV, rule: second, income: income([["fund:t", "2026-11-03", "12400.00"]]), label });
  assert.equal(fromCents(r.lines[0].afterCents), "1240.00");
  assert.equal(fromCents(r.lines[0].baseCents), "11160.00");
  assert.equal(fromCents(r.calculatedCents), "558.00");
  assert.equal(explainLine(r.lines[0], "Head Office share"), "5% of GH₵11,160.00 Tithes left after Head Office share = GH₵558.00");
});

test("10 negative stream clamps to 0 with a warning", () => {
  const r = computeLevy({ period: NOV, rule: rule({ versions: [v({ sources: ["ledger:Harvest"] })] }), income: income([["ledger:Harvest", "2026-11-02", "-120.00"]]), label });
  assert.equal(r.calculatedCents, BigInt(0));
  assert.ok(r.warnings[0].includes("GH₵120.00 of Harvest corrections could not be taken off"));
});

test("11 transfers are never a stream", () => {
  assert.equal(streamKeyForTxn(null, "Transfer"), null);
  assert.equal(streamKeyForTxn("Day Born", "Day Born"), "ledger:Day Born");
  assert.equal(streamKeyForTxn(null, "Facility hire"), "ledger:Facility hire");
  assert.equal(streamKeyForGift(null), "fund:none");
});

test("12 minimum and maximum", () => {
  const inc = income([["fund:t", "2026-11-03", "3200.00"]]);
  const lo = computeLevy({ period: NOV, rule: rule({ versions: [v({ minAmount: "500" })] }), income: inc, label });
  assert.equal(fromCents(lo.calculatedCents), "500.00");
  assert.equal(explainCap(lo), "Worked out as GH₵320.00, raised to the minimum of GH₵500.00.");
  const hi = computeLevy({ period: NOV, rule: rule({ versions: [v({ maxAmount: "300" })] }), income: inc, label });
  assert.equal(fromCents(hi.calculatedCents), "300.00");
  assert.equal(explainCap(hi), "Worked out as GH₵320.00, capped at the maximum of GH₵300.00.");
});

test("13 statusOf in every state", () => {
  const base = { endYmd: "2026-12-01", dueYmd: "2026-12-15" };
  assert.equal(statusOf({ ...base, todayYmd: "2026-11-30", dueCents: c("10"), paidCents: BigInt(0) }).status, "counting");
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-02", dueCents: BigInt(0), paidCents: BigInt(0) }).status, "nothing_due");
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-02", dueCents: BigInt(0), paidCents: BigInt(0), waived: true }).status, "waived");
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-02", dueCents: c("10"), paidCents: c("10") }).status, "paid");
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-02", dueCents: c("10"), paidCents: c("12") }).status, "credit");
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-02", dueCents: c("10"), paidCents: c("4") }).status, "part_paid");
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-02", dueCents: c("10"), paidCents: BigInt(0) }).status, "unpaid");
  // due day itself is not overdue; the next local day is
  assert.equal(statusOf({ ...base, todayYmd: "2026-12-15", dueCents: c("10"), paidCents: BigInt(0) }).status, "unpaid");
  const od = statusOf({ ...base, todayYmd: "2026-12-16", dueCents: c("10"), paidCents: c("4") });
  assert.equal(od.status, "overdue");
  assert.equal(od.partPaid, true);
  assert.equal(statusText(od.status, { dueYmd: base.dueYmd, partPaid: od.partPaid }), "Part paid, overdue");
  assert.equal(statusText("unpaid", { dueYmd: base.dueYmd }), "Due 15 Dec");
  // church-tz day boundary: 23:30 UTC on 15 Dec is already 16 Dec in Asia/Tokyo
  const tokyoToday = ymdInTz(new Date("2026-12-15T23:30:00Z"), "Asia/Tokyo");
  assert.equal(statusOf({ ...base, todayYmd: tokyoToday, dueCents: c("10"), paidCents: BigInt(0) }).status, "overdue");
  assert.equal(statusOf({ ...base, todayYmd: ymdInTz(new Date("2026-12-15T23:30:00Z"), "Africa/Accra"), dueCents: c("10"), paidCents: BigInt(0) }).status, "unpaid");
});

test("14 allocateOldestFirst", () => {
  const r = allocateOldestFirst(c("1500"), [{ id: "oct", leftCents: c("1000") }, { id: "nov", leftCents: c("800") }]);
  assert.deepEqual(r.allocations.map((a) => [a.id, fromCents(a.cents)]), [["oct", "1000.00"], ["nov", "500.00"]]);
  assert.equal(r.leftoverCents, BigInt(0));
  const extra = allocateOldestFirst(c("2000"), [{ id: "oct", leftCents: c("1000") }, { id: "nov", leftCents: c("800") }]);
  assert.equal(fromCents(extra.leftoverCents), "200.00");
});

test("15 driftOf with what was already accepted", () => {
  assert.equal(fromCents(driftOf(c("1270"), c("1240"), BigInt(0))), "30.00");
  assert.equal(driftOf(c("1270"), c("1240"), c("30")), BigInt(0));
  assert.equal(fromCents(driftOf(c("1200"), c("1240"), BigInt(0))), "-40.00");
});

test("16 reminder milestones: together, never repeated, overdue once", () => {
  const a = dueReminderMilestones("2026-12-15", "2026-12-14", [7, 1], []);
  assert.equal(a.send, "before");
  assert.deepEqual(a.consume.sort(), ["1", "7"]);
  const b = dueReminderMilestones("2026-12-15", "2026-12-15", [7, 1], ["7", "1"]);
  assert.equal(b.send, null);
  const c1 = dueReminderMilestones("2026-12-15", "2026-12-16", [7, 1], ["7", "1"]);
  assert.equal(c1.send, "overdue");
  assert.deepEqual(c1.consume, ["od"]);
  const c2 = dueReminderMilestones("2026-12-15", "2026-12-20", [7, 1], ["7", "1", "od"]);
  assert.equal(c2.send, null);
  const early = dueReminderMilestones("2026-12-15", "2026-12-01", [7, 1], []);
  assert.equal(early.send, null);
});

test("17 a new version cannot start inside a closed period", () => {
  const closed = [{ endYmd: "2026-11-01", label: "October 2026", lastDayLabel: "31 October" }];
  assert.equal(checkEffectiveFrom("2026-10-15", closed), "That date is inside October 2026, which is closed. Pick a date after 31 October or reopen October 2026 first.");
  assert.equal(checkEffectiveFrom("2026-11-01", closed), null);
});

test("18 templates stay generic and say they are examples", () => {
  const banned = /(pentecost|methodist|presbyterian|baptist|anglican|catholic|assemblies|adventist|apostolic|official|standard rate)/i;
  for (const t of LEVY_TEMPLATES) assert.ok(!banned.test(`${t.name} ${t.payee} ${t.blurb}`), t.key);
  for (const s of TEMPLATE_SETS) assert.ok(!banned.test(`${s.name} ${s.blurb}`), s.key);
  assert.ok(LEVY_TEMPLATES.filter((t) => t.kind === "fixed").every((t) => t.fixedAmount === null));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
