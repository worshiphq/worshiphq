/**
 * Staff & Payroll: the pay calculator. PURE: no database, no server-only, no Date.now(), so it can be tested with tsx.
 *
 * Money is integer pesewas (GHS x 100) and percentages are integer basis points (5.5% = 550), so there is never any
 * floating point drift. Every rounding is "half up" (away from zero) and happens once per figure.
 */

export type Pesewas = number;

/** One PAYE band: `width` GHS taxed at `pct` percent. The last band is open (width null). */
export interface Band {
  width: number | null;
  pct: number;
}

/** The rules a run is calculated with. Frozen onto PayrollRun.rules when the run is created. */
export interface PayrollRules {
  statutoryMode: "ghana" | "none";
  ssnitEePct: number;
  ssnitErPct: number;
  tier1Pct: number;
  tier2Pct: number;
  /** Monthly cap on the SSNIT contribution base (GHS), or null for no cap. */
  ssnitCap: number | null;
  bands: Band[];
  bandSetName: string;
  effectiveFrom: string;
  /** "ghana" taxes bonus at a flat rate up to a share of annual basic; the excess joins taxable income. */
  bonusTaxMode?: "normal" | "ghana";
  bonusRatePct?: number;
  bonusCapPct?: number;
  /** "ghana" taxes overtime of qualifying staff (basic at or below overtimeQualifyMax) at flat rates. */
  overtimeTaxMode?: "normal" | "ghana";
  overtimeLowPct?: number;
  overtimeHighPct?: number;
  overtimeQualifyMax?: number | null;
}

export type ItemKind = "earning" | "deduction";

export interface ItemInput {
  kind: ItemKind;
  code: string;
  label: string;
  /** GHS, positive. Unpaid leave is added by the calculator itself. */
  amount: number | string;
  taxable?: boolean;
  ssnitable?: boolean;
  preTax?: boolean;
  remitted?: boolean;
  source?: string;
  payItemId?: string | null;
  loanId?: string | null;
  /** For loan / advance recoveries: what is still owed (GHS). The recovery is never more than this. */
  loanBalance?: number | string | null;
  /** For loan / advance recoveries: when it was issued (ISO), so the newest is cut first if pay runs short. */
  loanIssuedAt?: string | null;
  leaveRequestId?: string | null;
}

export interface LineInput {
  basic: number | string;
  items: ItemInput[];
  /** Unpaid days, in half-day steps. */
  unpaidDays?: number;
  workingDays: number;
  ssnitApplies: boolean;
  tier2Applies: boolean;
  payeApplies: boolean;
  /** Bonus already taxed at the special rate earlier this year (GHS), for the annual cap. */
  ytdSpecialBonus?: number | string;
}

export interface ItemResult {
  kind: ItemKind;
  code: string;
  label: string;
  /** Pesewas. Negative only for the unpaid-leave earning. */
  amountP: Pesewas;
  taxable: boolean;
  ssnitable: boolean;
  preTax: boolean;
  remitted: boolean;
  source: string;
  payItemId: string | null;
  loanId: string | null;
  leaveRequestId: string | null;
  loanIssuedAt?: string | null;
  /** True when a loan recovery was cut short so net pay would not go below zero. */
  reduced?: boolean;
}

export interface LineResult {
  basicP: Pesewas;
  unpaidP: Pesewas;
  grossP: Pesewas;
  ssnitBaseP: Pesewas;
  taxableP: Pesewas;
  ssnitEeP: Pesewas;
  ssnitErP: Pesewas;
  tier1P: Pesewas;
  tier2P: Pesewas;
  payeP: Pesewas;
  /** Flat-rate bonus and overtime tax, already included in payeP. */
  specialTaxP: Pesewas;
  preTaxP: Pesewas;
  otherP: Pesewas;
  /** Post-tax deductions the church keeps (loan recovery, internal welfare): no cash leaves for these. */
  retainedP: Pesewas;
  /** Deductions paid over to someone else (remitted post-tax plus every pre-tax deduction). */
  remittedP: Pesewas;
  netP: Pesewas;
  employerCostP: Pesewas;
  items: ItemResult[];
  warnings: string[];
  /** Net pay is still below zero after cutting loan recoveries: the run cannot be sent for approval. */
  negative: boolean;
}

// ── Integer helpers ──

/** Divide two integers and round half away from zero. */
export function divRound(num: number, den: number): number {
  if (den <= 0) throw new Error("divRound: bad denominator");
  if (num < 0) return -divRound(-num, den);
  return Math.floor((2 * num + den) / (2 * den));
}

/** Round half up (away from zero) to an integer. Use only on values that are already near integers of pesewas. */
export function roundHalfUp(x: number): number {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

/** GHS (number or decimal string) to pesewas. */
export function toP(v: number | string | null | undefined): Pesewas {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0;
    return roundHalfUp(v * 100);
  }
  const s = String(v).trim().replace(/,/g, "");
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? roundHalfUp(n * 100) : 0;
  }
  const whole = Number(m[2] || "0");
  const fracRaw = (m[3] ?? "").padEnd(3, "0");
  // Round on the third decimal, half up.
  let p = whole * 100 + Number(fracRaw.slice(0, 2));
  if (Number(fracRaw[2]) >= 5) p += 1;
  return m[1] ? -p : p;
}

/** Pesewas to a 2-decimal string for Decimal columns ("1234.50"). */
export function fromP(p: Pesewas): string {
  const neg = p < 0;
  const a = Math.abs(Math.trunc(p));
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Pesewas to a GHS number (for Float columns such as Expense.amount). */
export function pToNumber(p: Pesewas): number {
  return Number(fromP(p));
}

/** Percent (up to 2 decimals) to basis points: 5.5 to 550. */
export function bps(pctValue: number | string): number {
  return roundHalfUp(Number(pctValue) * 100);
}

/** p x (bps / 10000), rounded half up. */
export function pct(p: Pesewas, basisPoints: number): Pesewas {
  return divRound(p * basisPoints, 10000);
}

/** Tax on a monthly taxable amount (pesewas) through the bands. Sums exact band products, rounds once. */
export function bandTax(taxableP: Pesewas, bands: Band[]): Pesewas {
  if (taxableP <= 0) return 0;
  let remaining = taxableP;
  let num = 0;
  for (const b of bands) {
    if (remaining <= 0) break;
    const widthP = b.width === null || b.width === undefined ? remaining : toP(b.width);
    const slice = Math.min(remaining, widthP);
    num += slice * bps(b.pct);
    remaining -= slice;
  }
  return divRound(num, 10000);
}

/** The tax on each band, for the "Try an amount" calculator. */
export function bandBreakdown(taxableP: Pesewas, bands: Band[]): { fromP: Pesewas; sliceP: Pesewas; pct: number; taxP: Pesewas }[] {
  const out: { fromP: Pesewas; sliceP: Pesewas; pct: number; taxP: Pesewas }[] = [];
  let remaining = Math.max(0, taxableP);
  let from = 0;
  for (const b of bands) {
    const widthP = b.width === null || b.width === undefined ? remaining : toP(b.width);
    const slice = Math.min(remaining, widthP);
    out.push({ fromP: from, sliceP: slice, pct: b.pct, taxP: divRound(slice * bps(b.pct), 10000) });
    remaining -= slice;
    from += widthP;
    if (remaining <= 0) break;
  }
  return out;
}

const LOAN_CODES = new Set(["loan", "advance"]);

/**
 * Calculate one person's pay for the month. Steps follow the build plan, section 2.
 */
export function computeLine(input: LineInput, rules: PayrollRules): LineResult {
  const warnings: string[] = [];
  const statutory = rules.statutoryMode !== "none";
  const ssnitOn = statutory && input.ssnitApplies;
  const payeOn = statutory && input.payeApplies;

  const basicP = Math.max(0, toP(input.basic));
  const W = Math.max(1, Math.trunc(input.workingDays || 0));
  const u2 = Math.max(0, Math.round((input.unpaidDays ?? 0) * 2));
  // 1. Unpaid leave: basic x (u / W), never more than basic.
  const unpaidP = u2 > 0 ? Math.min(basicP, divRound(basicP * u2, 2 * W)) : 0;

  const items: ItemResult[] = input.items
    .filter((i) => toP(i.amount) !== 0)
    .map((i) => {
      const loanId = i.loanId ?? null;
      let amountP = Math.abs(toP(i.amount));
      if (LOAN_CODES.has(i.code) && i.loanBalance !== undefined && i.loanBalance !== null) {
        amountP = Math.min(amountP, Math.max(0, toP(i.loanBalance)));
      }
      return {
        kind: i.kind,
        code: i.code,
        label: i.label,
        amountP,
        taxable: i.kind === "earning" ? i.taxable !== false : false,
        ssnitable: i.kind === "earning" ? !!i.ssnitable : false,
        preTax: i.kind === "deduction" ? !!i.preTax : false,
        remitted: i.kind === "deduction" ? !!i.remitted : false,
        source: i.source ?? "recurring",
        payItemId: i.payItemId ?? null,
        loanId,
        leaveRequestId: i.leaveRequestId ?? null,
        loanIssuedAt: i.loanIssuedAt ?? null,
      };
    })
    .filter((i) => i.amountP > 0);

  if (unpaidP > 0) {
    const days = u2 / 2;
    items.unshift({
      kind: "earning", code: "unpaid_leave", label: `Unpaid leave (${days} day${days === 1 ? "" : "s"})`,
      amountP: -unpaidP, taxable: true, ssnitable: true, preTax: false, remitted: false,
      source: "leave", payItemId: null, loanId: null, leaveRequestId: null,
    });
  }

  const earnings = items.filter((i) => i.kind === "earning" && i.code !== "unpaid_leave");
  const sumEarn = earnings.reduce((t, i) => t + i.amountP, 0);
  // 2. Gross.
  const grossP = basicP - unpaidP + sumEarn;

  // 3. SSNIT base.
  let ssnitBaseP = Math.max(0, basicP - unpaidP + earnings.filter((i) => i.ssnitable).reduce((t, i) => t + i.amountP, 0));
  if (rules.ssnitCap !== null && rules.ssnitCap !== undefined && rules.ssnitCap > 0) ssnitBaseP = Math.min(ssnitBaseP, toP(rules.ssnitCap));

  // 4. SSNIT.
  let ssnitEeP = 0, ssnitErP = 0, tier1P = 0, tier2P = 0;
  if (ssnitOn) {
    ssnitEeP = pct(ssnitBaseP, bps(rules.ssnitEePct));
    ssnitErP = pct(ssnitBaseP, bps(rules.ssnitErPct));
    if (input.tier2Applies) {
      tier1P = Math.min(ssnitEeP + ssnitErP, pct(ssnitBaseP, bps(rules.tier1Pct)));
      tier2P = ssnitEeP + ssnitErP - tier1P;
    } else {
      tier1P = ssnitEeP + ssnitErP;
      tier2P = 0;
    }
  }

  // 5. Pre-tax deductions (e.g. Tier 3).
  const preTaxP = items.filter((i) => i.kind === "deduction" && i.preTax).reduce((t, i) => t + i.amountP, 0);
  if (preTaxP > 0 && ssnitEeP + preTaxP > pct(ssnitBaseP, 1650)) {
    warnings.push("Pension relief is above 16.5% of the SSNIT base. Check the Tier 3 amount with your accountant.");
  }

  // Special (flat-rate) bonus and overtime tax, when switched on.
  let specialTaxP = 0;
  let specialExcludedP = 0;
  if (payeOn && rules.bonusTaxMode === "ghana") {
    const bonusP = earnings.filter((i) => i.code === "bonus" && i.taxable).reduce((t, i) => t + i.amountP, 0);
    if (bonusP > 0) {
      const capP = pct(basicP * 12, bps(rules.bonusCapPct ?? 15));
      const roomP = Math.max(0, capP - Math.max(0, toP(input.ytdSpecialBonus ?? 0)));
      const atRateP = Math.min(bonusP, roomP);
      specialTaxP += pct(atRateP, bps(rules.bonusRatePct ?? 5));
      specialExcludedP += atRateP; // the excess stays in taxable income
    }
  }
  if (payeOn && rules.overtimeTaxMode === "ghana" && rules.overtimeQualifyMax !== null && rules.overtimeQualifyMax !== undefined && basicP <= toP(rules.overtimeQualifyMax)) {
    const otP = earnings.filter((i) => i.code === "overtime" && i.taxable).reduce((t, i) => t + i.amountP, 0);
    if (otP > 0) {
      const halfBasicP = divRound(basicP, 2);
      const lowP = Math.min(otP, halfBasicP);
      specialTaxP += pct(lowP, bps(rules.overtimeLowPct ?? 5)) + pct(otP - lowP, bps(rules.overtimeHighPct ?? 10));
      specialExcludedP += otP;
    }
  }

  // 6. Taxable income.
  const taxableEarnP = basicP - unpaidP + earnings.filter((i) => i.taxable).reduce((t, i) => t + i.amountP, 0) - specialExcludedP;
  const taxableP = Math.max(0, taxableEarnP - ssnitEeP - preTaxP);

  // 7. PAYE.
  const payeP = payeOn ? bandTax(taxableP, rules.bands) + specialTaxP : 0;
  if (!payeOn) specialTaxP = 0;

  // 8. Post-tax deductions, cutting loan recoveries (newest first) if pay would go below zero.
  const post = items.filter((i) => i.kind === "deduction" && !i.preTax);
  let otherP = post.reduce((t, i) => t + i.amountP, 0);
  let netP = grossP - ssnitEeP - payeP - preTaxP - otherP;
  if (netP < 0) {
    const loans = post
      .map((it, idx) => ({ it, idx, at: it.loanIssuedAt ?? "" }))
      .filter((x) => LOAN_CODES.has(x.it.code))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.idx - a.idx));
    for (const { it } of loans) {
      if (netP >= 0) break;
      const cut = Math.min(it.amountP, -netP);
      it.amountP -= cut;
      it.reduced = true;
      otherP -= cut;
      netP += cut;
    }
    if (loans.some((l) => l.it.reduced)) warnings.push("A loan recovery was reduced so net pay does not go below zero.");
  }
  const negative = netP < 0;
  if (negative) warnings.push("Net pay is below zero. Reduce a deduction or leave this person out of the run.");

  const finalItems = items.filter((i) => i.amountP !== 0);
  const retainedP = finalItems.filter((i) => i.kind === "deduction" && !i.preTax && !i.remitted).reduce((t, i) => t + i.amountP, 0);
  const remittedP = finalItems.filter((i) => i.kind === "deduction" && (i.preTax || i.remitted)).reduce((t, i) => t + i.amountP, 0);

  return {
    basicP, unpaidP, grossP, ssnitBaseP, taxableP,
    ssnitEeP, ssnitErP, tier1P, tier2P,
    payeP, specialTaxP, preTaxP, otherP, retainedP, remittedP,
    netP,
    // 10. Employer cost.
    employerCostP: grossP + ssnitErP,
    items: finalItems,
    warnings,
    negative,
  };
}

export interface LineTotalsInput {
  gross: Pesewas; ssnitEe: Pesewas; ssnitEr: Pesewas; paye: Pesewas; preTax: Pesewas; other: Pesewas; net: Pesewas; employerCost: Pesewas;
}

/** Run totals: sums of the stored line values (never recomputed from aggregates). */
export function totals(lines: LineTotalsInput[]) {
  const t = { headcount: lines.length, gross: 0, ssnitEe: 0, ssnitEr: 0, paye: 0, other: 0, net: 0, employerCost: 0 };
  for (const l of lines) {
    t.gross += l.gross; t.ssnitEe += l.ssnitEe; t.ssnitEr += l.ssnitEr; t.paye += l.paye;
    t.other += l.preTax + l.other; t.net += l.net; t.employerCost += l.employerCost;
  }
  return t;
}

/** "November 2026". */
export function periodLabel(year: number, month: number): string {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[month - 1] ?? "Month"} ${year}`;
}

/** "2026-11". */
export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Is YYYY-MM inside [from, to] (either end open when null)? */
export function inPeriod(key: string, from: string | null | undefined, to: string | null | undefined): boolean {
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/** "GHS 1,234.50" from pesewas, matching the app's money format so the hide-amounts eye catches it. */
export function ghs(p: Pesewas): string {
  const neg = p < 0;
  const s = fromP(Math.abs(p));
  const [w, f] = s.split(".");
  return `${neg ? "-" : ""}GHS ${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}
