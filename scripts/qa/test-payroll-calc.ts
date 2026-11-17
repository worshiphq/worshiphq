/**
 * Staff & Payroll: pure calculator tests. No database, nothing sent.
 *   npx tsx scripts/qa/test-payroll-calc.ts
 */
import { bandTax, computeLine, toP, fromP, pct, divRound, roundHalfUp, bps, totals, type PayrollRules, type ItemInput } from "../../src/lib/payroll/calc";
import { DEFAULT_PAYROLL_RULES, GHANA_PAYE_BANDS_2024 } from "../../src/lib/payroll/defaults";
import { canApprove, pickBandSet, nextStatus, BandsSchema, freezeRules, SettingsSchema } from "../../src/lib/payroll/rules";
import { countLeaveDays, entitlementFor, unpaidDaysInMonth, workingDaysIn, leaveBalance } from "../../src/lib/payroll/leave";
import { payslipSmsText, maskLabel, maskId, isPayrollLocked, last4, GHANA_CARD_RE } from "../../src/lib/payroll/mask";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name: string, cond: boolean) { eq(name, cond, true); }

const R: PayrollRules = { ...DEFAULT_PAYROLL_RULES };
const B = GHANA_PAYE_BANDS_2024;
const G = (n: number) => toP(n);

// ── Money helpers ──
eq("toP string", toP("1234.56"), 123456);
eq("toP rounding 3dp", toP("0.125"), 13);
eq("toP float", toP(0.29), 29);
eq("toP commas", toP("1,000.5"), 100050);
eq("fromP", fromP(123456), "1234.56");
eq("fromP small", fromP(5), "0.05");
eq("fromP negative", fromP(-28571), "-285.71");
eq("divRound half up", divRound(5, 10), 1);
eq("divRound below half", divRound(4, 10), 0);
eq("divRound negative", divRound(-5, 10), -1);
eq("roundHalfUp .5", roundHalfUp(2.5), 3);
eq("pct 5.5% of 3000", pct(G(3000), 550), 16500);
eq("bps 17.5", bps(17.5), 1750);

// ── bandTax ──
eq("bandTax 0", bandTax(0, B), 0);
eq("bandTax 490", bandTax(G(490), B), 0);
eq("bandTax 600", bandTax(G(600), B), 550);
eq("bandTax 730", bandTax(G(730), B), 1850);
eq("bandTax 3635 (worked example)", bandTax(G(3635), B), 52688);
// Sum of every band up to 50,416.67: 0 + 5.5 + 13 + 554.17 (3166.67 x 17.5% = 554.16725) + 4000 + 9156 = exact sum then round.
const fullNum = 49000 * 0 + 11000 * 500 + 13000 * 1000 + 316667 * 1750 + 1600000 * 2500 + 3052000 * 3000;
eq("bandTax 50416.67 = all bands", bandTax(G(50416.67), B), divRound(fullNum, 10000));
eq("bandTax 100000 = bands + 35% of excess", bandTax(G(100000), B), divRound(fullNum + (G(100000) - G(50416.67)) * 3500, 10000));

// ── Worked example ──
const worked: ItemInput[] = [
  { kind: "earning", code: "housing", label: "Housing", amount: "500", taxable: true, ssnitable: false },
  { kind: "earning", code: "transport", label: "Transport", amount: "300", taxable: true, ssnitable: false },
  { kind: "deduction", code: "welfare", label: "Welfare", amount: "20" },
  { kind: "deduction", code: "loan", label: "Loan", amount: "200", loanBalance: "1000", loanId: "L1", source: "loan" },
];
const w = computeLine({ basic: "3000", items: worked, workingDays: 21, ssnitApplies: true, tier2Applies: true, payeApplies: true }, R);
eq("worked gross", fromP(w.grossP), "3800.00");
eq("worked ssnit base", fromP(w.ssnitBaseP), "3000.00");
eq("worked ee", fromP(w.ssnitEeP), "165.00");
eq("worked er", fromP(w.ssnitErP), "390.00");
eq("worked tier1", fromP(w.tier1P), "405.00");
eq("worked tier2", fromP(w.tier2P), "150.00");
eq("worked taxable", fromP(w.taxableP), "3635.00");
eq("worked paye", fromP(w.payeP), "526.88");
eq("worked other", fromP(w.otherP), "220.00");
eq("worked net", fromP(w.netP), "2888.12");
eq("worked employer cost", fromP(w.employerCostP), "4190.00");
eq("worked retained (welfare + loan)", fromP(w.retainedP), "220.00");
eq("worked not negative", w.negative, false);

// ── Unpaid leave example ──
const u = computeLine({ basic: "3000", items: [], unpaidDays: 2, workingDays: 21, ssnitApplies: true, tier2Applies: true, payeApplies: true }, R);
eq("unpaid amount", fromP(u.unpaidP), "285.71");
eq("unpaid ssnit base", fromP(u.ssnitBaseP), "2714.29");
eq("unpaid ee", fromP(u.ssnitEeP), "149.29");
eq("unpaid taxable", fromP(u.taxableP), "2565.00");
eq("unpaid leave item is a negative earning", u.items[0].code === "unpaid_leave" && u.items[0].amountP === -28571, true);
const halfDay = computeLine({ basic: "2200", items: [], unpaidDays: 0.5, workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: false }, R);
eq("half day unpaid", fromP(halfDay.unpaidP), "50.00");

// ── Tier split always reconciles ──
let seed = 42;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let tierOk = true;
for (let i = 0; i < 1000; i++) {
  const basic = (Math.floor(rand() * 5_000_000) / 100).toFixed(2);
  const r = computeLine({ basic, items: [], workingDays: 22, ssnitApplies: true, tier2Applies: true, payeApplies: true }, R);
  if (r.tier1P + r.tier2P !== r.ssnitEeP + r.ssnitErP) tierOk = false;
}
ok("tier1 + tier2 = ee + er for 1,000 bases", tierOk);
const noT2 = computeLine({ basic: "3000", items: [], workingDays: 22, ssnitApplies: true, tier2Applies: false, payeApplies: true }, R);
eq("tier2 off puts everything in tier 1", [noT2.tier1P, noT2.tier2P], [55500, 0]);

// ── Toggles ──
const noPaye = computeLine({ basic: "6000", items: [], workingDays: 22, ssnitApplies: true, tier2Applies: true, payeApplies: false }, R);
eq("PAYE off", noPaye.payeP, 0);
const noSsnit = computeLine({ basic: "3000", items: worked.slice(0, 2), workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: true }, R);
eq("SSNIT off: ee/er 0", [noSsnit.ssnitEeP, noSsnit.ssnitErP], [0, 0]);
eq("SSNIT off: taxable = gross", noSsnit.taxableP, noSsnit.grossP);
const none = computeLine({ basic: "3000", items: [], workingDays: 22, ssnitApplies: true, tier2Applies: true, payeApplies: true }, { ...R, statutoryMode: "none" });
eq("statutory none: no SSNIT or PAYE", [none.ssnitEeP, none.payeP, none.netP], [0, 0, 300000]);

// ── Cap ──
const capped = computeLine({ basic: "8000", items: [], workingDays: 22, ssnitApplies: true, tier2Applies: true, payeApplies: true }, { ...R, ssnitCap: 5000 });
eq("cap 5,000 on basic 8,000", fromP(capped.ssnitBaseP), "5000.00");

// ── Cleaner: basic 450 pays no PAYE ──
const cleaner = computeLine({ basic: "450", items: [], workingDays: 22, ssnitApplies: true, tier2Applies: true, payeApplies: true }, R);
eq("cleaner PAYE 0", cleaner.payeP, 0);

// ── Loan clamp and net-negative guard ──
const clamp = computeLine({ basic: "1000", items: [{ kind: "deduction", code: "loan", label: "Loan", amount: "300", loanBalance: "120", loanId: "L" }], workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: false }, R);
eq("loan installment capped at balance", clamp.items[0].amountP, 12000);
const neg = computeLine({
  basic: "500",
  items: [
    { kind: "deduction", code: "loan", label: "Old loan", amount: "300", loanBalance: "1000", loanId: "A", loanIssuedAt: "2026-01-01" },
    { kind: "deduction", code: "advance", label: "New advance", amount: "300", loanBalance: "1000", loanId: "B", loanIssuedAt: "2026-10-01" },
  ],
  workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: false,
}, R);
eq("newest recovery cut first", [neg.items.find((i) => i.loanId === "B")?.amountP, neg.items.find((i) => i.loanId === "A")?.amountP], [20000, 30000]);
eq("net exactly zero, not negative", [neg.netP, neg.negative], [0, false]);
const stillNeg = computeLine({ basic: "100", items: [{ kind: "deduction", code: "welfare", label: "Welfare", amount: "150" }], workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: false }, R);
eq("still negative is flagged", stillNeg.negative, true);

// ── Pre-tax (Tier 3) ──
const t3 = computeLine({ basic: "3000", items: [{ kind: "deduction", code: "tier3", label: "Tier 3", amount: "400", preTax: true, remitted: true }], workingDays: 22, ssnitApplies: true, tier2Applies: true, payeApplies: true }, R);
eq("tier 3 reduces taxable", fromP(t3.taxableP), "2435.00");
ok("tier 3 over 16.5% warns", t3.warnings.some((x) => x.includes("16.5%")));
eq("tier 3 counted as remitted", t3.remittedP, 40000);

// ── Special bonus / overtime tax ──
const bonusRules: PayrollRules = { ...R, bonusTaxMode: "ghana", bonusRatePct: 5, bonusCapPct: 15 };
const bon = computeLine({ basic: "1000", items: [{ kind: "earning", code: "bonus", label: "Bonus", amount: "2000" }], workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: true }, bonusRules);
// Cap = 15% of 12,000 = 1,800 at 5% = 90; excess 200 joins taxable: 1000 + 200 = 1200.
eq("bonus special tax", fromP(bon.specialTaxP), "90.00");
eq("bonus excess in taxable", fromP(bon.taxableP), "1200.00");
eq("bonus paye includes special", bon.payeP, bandTax(G(1200), B) + 9000);
const otRules: PayrollRules = { ...R, overtimeTaxMode: "ghana", overtimeQualifyMax: 1500 };
const ot = computeLine({ basic: "1000", items: [{ kind: "earning", code: "overtime", label: "Overtime", amount: "700" }], workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: true }, otRules);
eq("overtime 5% to half basic, 10% above", fromP(ot.specialTaxP), "45.00");
const otNo = computeLine({ basic: "2000", items: [{ kind: "earning", code: "overtime", label: "Overtime", amount: "700" }], workingDays: 22, ssnitApplies: false, tier2Applies: true, payeApplies: true }, otRules);
eq("non-qualifying overtime is normal income", [otNo.specialTaxP, fromP(otNo.taxableP)], [0, "2700.00"]);

// ── Rounding determinism vs BigInt reference ──
let det = true;
for (let i = 0; i < 10000; i++) {
  const p = Math.floor(rand() * 10_000_000);
  const rate = [550, 1300, 1350, 500, 1750, 2500][i % 6];
  const ref = (BigInt(p) * BigInt(rate) * BigInt(2) + BigInt(10000)) / BigInt(20000);
  if (BigInt(pct(p, rate)) !== ref) det = false;
}
ok("pct matches BigInt half-up for 10,000 values", det);
eq("tie rounds half up", pct(1, 5000), 1);
let detTax = true;
for (let i = 0; i < 2000; i++) {
  const p = Math.floor(rand() * 8_000_000);
  let rem = BigInt(p); let num = BigInt(0);
  for (const b of B) { const wP = b.width === null ? rem : BigInt(toP(b.width)); const s = rem < wP ? rem : wP; num += s * BigInt(bps(b.pct)); rem -= s; if (rem <= BigInt(0)) break; }
  if (BigInt(bandTax(p, B)) !== (num * BigInt(2) + BigInt(10000)) / BigInt(20000)) detTax = false;
}
ok("bandTax matches BigInt reference", detTax);

// ── Totals ──
const t = totals([
  { gross: w.grossP, ssnitEe: w.ssnitEeP, ssnitEr: w.ssnitErP, paye: w.payeP, preTax: w.preTaxP, other: w.otherP, net: w.netP, employerCost: w.employerCostP },
  { gross: u.grossP, ssnitEe: u.ssnitEeP, ssnitEr: u.ssnitErP, paye: u.payeP, preTax: u.preTaxP, other: u.otherP, net: u.netP, employerCost: u.employerCostP },
]);
eq("totals net", t.net, w.netP + u.netP);
// Ledger invariant per line: what is posted as expense = employer cost - retained deductions.
const posted = w.netP + w.ssnitEeP + w.ssnitErP + w.payeP + w.remittedP;
eq("posting invariant", posted, w.employerCostP - w.retainedP);

// ── Leave ──
eq("working days Nov 2026", workingDaysIn(2026, 11), 21);
eq("working days Dec 2026 minus Christmas and Boxing Day", workingDaysIn(2026, 12, ["2026-12-25", "2026-12-28"]), 21);
eq("leave across a weekend", countLeaveDays("2026-11-13", "2026-11-17"), 3);
eq("leave minus a holiday", countLeaveDays("2026-11-13", "2026-11-17", ["2026-11-16"]), 2);
eq("half day", countLeaveDays("2026-11-17", "2026-11-17", [], true), 0.5);
eq("half day on Saturday", countLeaveDays("2026-11-14", "2026-11-14", [], true), 0);
eq("proration 1 July start = half", entitlementFor(15, 2026, "2026-07-01"), 7.5);
eq("proration earlier year = full", entitlementFor(15, 2026, "2020-03-01"), 15);
eq("proration rounds down to half", entitlementFor(10, 2026, "2026-04-15"), 7.5);
eq("unpaid days clipped to month", unpaidDaysInMonth({ startDate: "2026-10-29", endDate: "2026-11-04" }, 2026, 11), 3);
eq("unpaid days other month", unpaidDaysInMonth({ startDate: "2026-10-29", endDate: "2026-11-04" }, 2026, 10), 2);
eq("balance", leaveBalance(15, [2], [3, 1.5]), 12.5);

// ── Maker-checker ──
const run = (o: Partial<{ preparedById: string; submittedById: string; lastEditedById: string }> = {}) => ({ status: "review", preparedById: "a", submittedById: "a", lastEditedById: "a", ...o });
eq("single manager auto: self-approve allowed", canApprove({ run: run(), actorId: "a", eligibleManagers: ["a"], mode: "auto" }), { ok: true, selfApproved: true });
eq("two managers same person refused", canApprove({ run: run(), actorId: "a", eligibleManagers: ["a", "b"], mode: "auto" }).ok, false);
eq("two managers other person allowed", canApprove({ run: run(), actorId: "b", eligibleManagers: ["a", "b"], mode: "auto" }), { ok: true, selfApproved: false });
eq("lastEditedBy refused", canApprove({ run: run({ preparedById: "c", submittedById: "c", lastEditedById: "b" }), actorId: "b", eligibleManagers: ["a", "b", "c"], mode: "auto" }).ok, false);
eq("always mode with one manager refused", canApprove({ run: run(), actorId: "a", eligibleManagers: ["a"], mode: "always" }).ok, false);
eq("edited own line refused", canApprove({ run: run({ preparedById: "a", submittedById: "a", lastEditedById: "a" }), actorId: "b", eligibleManagers: ["a", "b"], mode: "auto", actorEditedOwnLine: true }).ok, false);
eq("not a manager refused", canApprove({ run: run(), actorId: "z", eligibleManagers: ["a", "b"], mode: "auto" }).ok, false);
eq("not in review refused", canApprove({ run: { ...run(), status: "draft" }, actorId: "b", eligibleManagers: ["a", "b"], mode: "auto" }).ok, false);
eq("status machine submit", nextStatus("draft", "submit"), "review");
eq("status machine pay from draft", nextStatus("draft", "pay"), null);
eq("status machine reverse", nextStatus("paid", "reverse"), "reversed");

// ── Band sets and validation ──
const sets = [{ name: "Old", effectiveFrom: "2023-01-01" }, { name: "New", effectiveFrom: "2026-12-01" }, { name: "Mid", effectiveFrom: "2024-01-01" }];
eq("pickBandSet Nov 2026", pickBandSet(sets, 2026, 11)?.name, "Mid");
eq("pickBandSet Dec 2026", pickBandSet(sets, 2026, 12)?.name, "New");
eq("pickBandSet none", pickBandSet(sets, 2022, 5), null);
ok("default bands valid", BandsSchema.safeParse(B).success);
ok("closed last band invalid", !BandsSchema.safeParse([{ width: 100, pct: 0 }]).success);
ok("3dp percent invalid", !BandsSchema.safeParse([{ width: null, pct: 5.125 }]).success);
const fr = freezeRules({ ssnitEmployeePct: "5.5", ssnitEmployerPct: "13", tier1Pct: "13.5", tier2Pct: "5", ssnitMonthlyCap: null, statutoryMode: "ghana" }, { name: "Custom", effectiveFrom: new Date("2025-01-01"), bands: [{ width: null, pct: 10 }] });
eq("freezeRules takes the set", [fr.bandSetName, fr.bands.length, fr.effectiveFrom], ["Custom", 1, "2025-01-01"]);
ok("settings: tiers must add up", !SettingsSchema.safeParse({
  statutoryMode: "ghana", ssnitEmployeePct: 5.5, ssnitEmployerPct: 13, tier1Pct: 13, tier2Pct: 5, workingDaysRule: "weekdays", fixedWorkingDays: 22, postingMode: "split",
  salaryCategory: "a", ssnitCategory: "b", payeCategory: "c", deductionsCategory: "d", loansCategory: "e", makerChecker: "auto", staffNoPrefix: "ST",
  bonusTaxMode: "normal", bonusRatePct: 5, bonusCapPct: 15, overtimeTaxMode: "normal", overtimeLowPct: 5, overtimeHighPct: 10,
}).success);

// ── Privacy helpers ──
const sms = payslipSmsText("Grace Chapel", "November 2026");
ok("SMS has no amount by default", !/\d+\.\d{2}|GHS|₵/.test(sms));
ok("SMS shows amount only when given", payslipSmsText("Grace Chapel", "November 2026", "GHS 2,888.12").includes("GHS 2,888.12"));
eq("mask momo", maskLabel("momo", { network: "MTN", last4: "4821" }), "MTN MoMo ending 4821");
eq("mask Ghana Card", maskId("ghanaCard", last4("GHA-123456789-0")), "GHA-•••••••89-0");
ok("Ghana Card regex", GHANA_CARD_RE.test("GHA-123456789-0") && !GHANA_CARD_RE.test("GHA-12345-0"));
eq("payroll lock guard", [isPayrollLocked({ payrollRunId: "r" }), isPayrollLocked({ staffLoanId: "l" }), isPayrollLocked({ payrollRunId: null })], [true, true, false]);

console.log(`\npayroll calc: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
