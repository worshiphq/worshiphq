import type { Band, PayrollRules } from "./calc";

/**
 * Starting values only. Every one is editable in Payroll settings, is frozen onto each run when the run is created,
 * and is shown with "Confirm with your accountant or GRA before your first run". WorshipHQ does not give tax advice.
 */

/** Ghana resident monthly PAYE bands (from Jan 2024), as published by GRA at the time of writing. */
export const GHANA_PAYE_BANDS_2024: Band[] = [
  { width: 490, pct: 0 },
  { width: 110, pct: 5 },
  { width: 130, pct: 10 },
  { width: 3166.67, pct: 17.5 },
  { width: 16000, pct: 25 },
  { width: 30520, pct: 30 },
  { width: null, pct: 35 },
];
export const GHANA_PAYE_BANDS_NAME = "Ghana resident monthly bands (from Jan 2024)";

/** Flat rate for non-resident staff (one open band). */
export const NON_RESIDENT_BANDS: Band[] = [{ width: null, pct: 25 }];

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
  statutoryMode: "ghana",
  ssnitEePct: 5.5,
  ssnitErPct: 13,
  tier1Pct: 13.5,
  tier2Pct: 5,
  ssnitCap: null,
  bands: GHANA_PAYE_BANDS_2024,
  bandSetName: GHANA_PAYE_BANDS_NAME,
  effectiveFrom: "2024-01-01",
  bonusTaxMode: "normal",
  bonusRatePct: 5,
  bonusCapPct: 15,
  overtimeTaxMode: "normal",
  overtimeLowPct: 5,
  overtimeHighPct: 10,
  overtimeQualifyMax: null,
};

export const ACCOUNTANT_NOTE = "Confirm with your accountant or GRA before your first run.";
export const RATES_BANNER =
  "These are the usual Ghana rates. Rules change. Please confirm with your accountant or SSNIT and GRA before your first payroll.";
export const CLERGY_NOTE =
  "Some ministers are treated differently for SSNIT and tax. Turn these off only if your accountant confirms.";

export const DEFAULT_LEAVE_TYPES = [
  { name: "Annual leave", daysPerYear: 15, paid: true, carryOverMax: 5, color: "#0d9488" },
  { name: "Sick leave", daysPerYear: 10, paid: true, carryOverMax: 0, color: "#f59e0b" },
  { name: "Maternity leave", daysPerYear: 84, paid: true, carryOverMax: 0, color: "#ec4899" },
  { name: "Compassionate leave", daysPerYear: 3, paid: true, carryOverMax: 0, color: "#6366f1" },
  { name: "Unpaid leave", daysPerYear: 0, paid: false, carryOverMax: 0, color: "#64748b" },
];

export const EARNING_CODES: { code: string; label: string; taxable: boolean; ssnitable: boolean }[] = [
  { code: "housing", label: "Housing allowance", taxable: true, ssnitable: false },
  { code: "transport", label: "Transport allowance", taxable: true, ssnitable: false },
  { code: "fuel", label: "Fuel allowance", taxable: true, ssnitable: false },
  { code: "utility", label: "Utility allowance", taxable: true, ssnitable: false },
  { code: "responsibility", label: "Responsibility allowance", taxable: true, ssnitable: false },
  { code: "other", label: "Other allowance", taxable: true, ssnitable: false },
];

/** One-off earnings added on a run line. */
export const ONEOFF_EARNING_CODES = [
  { code: "bonus", label: "Bonus" },
  { code: "overtime", label: "Overtime" },
  { code: "arrears", label: "Arrears" },
  { code: "other", label: "Other payment" },
];

export const DEDUCTION_CODES: { code: string; label: string; preTax: boolean; remitted: boolean }[] = [
  { code: "welfare", label: "Staff welfare", preTax: false, remitted: false },
  { code: "union", label: "Union dues", preTax: false, remitted: true },
  { code: "tier3", label: "Tier 3 pension (voluntary)", preTax: true, remitted: true },
  { code: "insurance", label: "Insurance", preTax: false, remitted: true },
  { code: "other", label: "Other deduction", preTax: false, remitted: false },
];

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "stipend", label: "Stipend" },
];

export const STAFF_STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "left", label: "Left" },
];

export const PAYOUT_METHODS = [
  { value: "bank", label: "Bank" },
  { value: "momo", label: "Mobile Money" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];

export const MOMO_NETWORKS = ["MTN", "Telecel", "AirtelTigo"];

export const RUN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  review: "Waiting for approval",
  approved: "Approved",
  paid: "Paid",
  reversed: "Reversed",
};

export const POSTING_LABEL: Record<string, string> = {
  net_pay: "Net pay",
  ssnit: "SSNIT",
  paye: "PAYE",
  deductions: "Deductions paid over",
  budget: "Department budget",
};
