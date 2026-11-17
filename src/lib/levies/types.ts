// Pure types for levies. No server imports, so the engine and its tests can use them anywhere.

export type LevyKind = "percent" | "fixed";
export type Frequency = "monthly" | "quarterly" | "yearly";
export const FREQUENCIES: Frequency[] = ["monthly", "quarterly", "yearly"];

/** fund:<fundId> | fund:none | ledger:<label> */
export type StreamKey = string;

/** Money per income stream per local day (YYYY-MM-DD), in pesewas. */
export type DailyIncome = Map<StreamKey, Map<string, bigint>>;

/** How a levy is worked out from `fromYmd` (a local day) onward. */
export interface VersionInput {
  id: string;
  fromYmd: string;
  kind: LevyKind;
  /** Percent, e.g. 10 or "12.5". Up to 4 decimal places. */
  rate: number | string | null;
  fixedAmount: number | string | null;
  allIncome: boolean;
  sources: StreamKey[];
  minAmount: number | string | null;
  maxAmount: number | string | null;
}

export interface RuleInput {
  id: string;
  name: string;
  /** First local day counted. */
  startsYmd: string;
  /** First local day NOT counted (exclusive), or null. */
  endsYmd: string | null;
  versions: VersionInput[];
  /** Work out on what is left after this other levy (one level only). */
  after?: RuleInput | null;
}

export interface PeriodWindow {
  key: string;
  startYmd: string;
  /** Exclusive. */
  endYmd: string;
}

export interface LevyLine {
  kind: LevyKind;
  stream: StreamKey | null;
  label: string;
  fromYmd: string;
  /** Exclusive. */
  toYmd: string;
  incomeCents: bigint;
  /** Taken off first because another levy is worked out before this one. */
  afterCents: bigint;
  baseCents: bigint;
  /** rate x 10000, so 10% is 100000. */
  rateUnits: bigint;
  levyCents: bigint;
  versionId: string;
  /** True when the line covers only part of the period (a rate change or the levy starting mid-period). */
  partial: boolean;
}

export interface LevyComputation {
  lines: LevyLine[];
  incomeBaseCents: bigint;
  /** Sum of the rounded lines, before any minimum or maximum. */
  rawCents: bigint;
  /** What is charged after the minimum or maximum. */
  calculatedCents: bigint;
  cap: { kind: "min" | "max"; limitCents: bigint } | null;
  warnings: string[];
  versionIds: string[];
}

export type LevyStatus = "counting" | "nothing_due" | "waived" | "paid" | "credit" | "part_paid" | "overdue" | "unpaid";
