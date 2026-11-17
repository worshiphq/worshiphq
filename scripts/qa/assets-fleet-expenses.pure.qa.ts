/**
 * Pure checks for assets, vehicles and expenses. No database, no network.
 * Run: npx tsx scripts/qa/assets-fleet-expenses.pure.qa.ts
 */
import { straightLine, depreciationSchedule, bookValueOf } from "../../src/lib/assets/depreciation";
import { advance } from "../../src/lib/expenses/recurrence";
import { serviceDue, alertThresholdHit, expiryState } from "../../src/lib/fleet/due";
import { kmPerLitre, costPerKm } from "../../src/lib/fleet/efficiency";
import { formatTag, isTag } from "../../src/lib/assets/tag";

let failed = 0, passed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else { failed++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// 1. Straight-line depreciation
const base = { cost: 12000, salvage: 2000, lifeYears: 5, inService: D("2024-01-01") };
const mid = straightLine({ ...base, asOf: D("2026-07-01") });
check("accumulated at 30 months", mid.accumulated, 5000);
check("book value at 30 months", mid.bookValue, 7000);
check("annual charge", mid.annual, 2000);
check("book value after life", straightLine({ ...base, asOf: D("2031-01-01") }).bookValue, 2000);
check("fully depreciated after life", straightLine({ ...base, asOf: D("2031-01-01") }).fullyDepreciated, true);
check("no life means cost", straightLine({ ...base, lifeYears: null, asOf: D("2026-07-01") }).bookValue, 12000);
check("salvage above cost is clamped", straightLine({ cost: 1000, salvage: 5000, lifeYears: 3, inService: D("2020-01-01"), asOf: D("2026-01-01") }).bookValue, 1000);
check("before in service", straightLine({ ...base, asOf: D("2023-06-01") }).bookValue, 12000);
const sched = depreciationSchedule(base);
check("schedule first year", sched[0], { year: 2024, opening: 12000, charge: 2000, closing: 10000 });
check("schedule ends at salvage", sched[sched.length - 1].closing, 2000);
check("bookValueOf quantity", bookValueOf({ purchasePrice: 100, quantity: 3 }).book, 300);
check("bookValueOf disposed", bookValueOf({ purchasePrice: 100, status: "disposed" }).book, 0);

// 2. Recurrence
const j31 = D("2027-01-31");
const f28 = advance(j31, "monthly", 31);
check("Jan 31 -> Feb 28", ymd(f28), "2027-02-28");
check("Feb 28 -> Mar 31 (anchor)", ymd(advance(f28, "monthly", 31)), "2027-03-31");
check("leap year Feb 29", ymd(advance(D("2028-01-31"), "monthly", 31)), "2028-02-29");
check("weekly +7", ymd(advance(D("2027-01-01"), "weekly")), "2027-01-08");
check("yearly Feb 29 -> Feb 28", ymd(advance(D("2028-02-29"), "yearly", 29)), "2029-02-28");
check("quarterly Nov 30 -> Feb 28", ymd(advance(D("2026-11-30"), "quarterly", 30)), "2027-02-28");

// 3. Service due
const rule = { everyKm: 5000, lastDoneKm: 40000 };
check("44400 km soon", serviceDue(rule, 44400).state, "soon");
check("45100 km overdue", serviceDue(rule, 45100).state, "overdue");
check("43000 km ok", serviceDue(rule, 43000).state, "ok");
const today = D("2026-11-17");
const lastDone = new Date(today.getTime() - 170 * 86400000);
check("180 days rule, 10 days ahead soon", serviceDue({ everyDays: 180, lastDoneAt: lastDone }, null, today).state, "soon");
check("no interval unset", serviceDue({}, 1000).state, "unset");

// 4. Threshold
check("7 is a threshold", alertThresholdHit(7), true);
check("8 is not", alertThresholdHit(8), false);
check("-3 overdue", alertThresholdHit(-3), "overdue");
check("expiry soon", expiryState(D("2026-11-24"), today), { days: 7, state: "soon" });
check("expiry unset", expiryState(null, today).state, "unset");
check("expiry overdue", expiryState(D("2026-11-16"), today).state, "overdue");

// 5. Efficiency
const fills = [
  { date: "2026-01-01", litres: 50, cost: 700, odometer: 10000, fullTank: true },
  { date: "2026-01-05", litres: 20, cost: 280, odometer: 10200, fullTank: false },
  { date: "2026-01-09", litres: 30, cost: 420, odometer: 10500, fullTank: true },
];
check("km per litre full to full", kmPerLitre(fills), 10);
check("km per litre needs two fulls", kmPerLitre(fills.slice(0, 2)), null);
check("cost per km", costPerKm(1400, 500), 2.8);

// 6. Tags
check("tag format", formatTag(7), "AST-0007");
check("tag format large", formatTag(12345), "AST-12345");
check("isTag", [isTag("ast-0007"), isTag("AST-7")], [true, false]);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
