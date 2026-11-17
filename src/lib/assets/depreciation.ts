/**
 * How much an asset is worth today, worked out by straight-line depreciation.
 * Pure: no database, no server imports, so the QA scripts can call it directly.
 *
 * - The yearly charge is (cost - salvage) / life, spread evenly over the months.
 * - Only whole months count: an item put in service on 15 March has lost nothing on 1 April's start.
 * - Salvage is kept between 0 and the cost, and the book value never drops below it.
 */

export const DEFAULT_LIFE: Record<string, number> = {
  IT: 3,
  "audio-visual": 5,
  musical: 7,
  furniture: 10,
  vehicle: 5,
  kitchen: 5,
  general: 5,
  other: 5,
};

export type StraightLineInput = {
  cost: number | null | undefined;
  salvage?: number | null;
  lifeYears?: number | null;
  inService?: Date | string | null;
  asOf?: Date;
};

export type StraightLineResult = {
  annual: number;
  monthly: number;
  accumulated: number;
  bookValue: number;
  fullyDepreciated: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole calendar months from `a` to `b` (0 when b is before a). */
export function monthsBetween(a: Date, b: Date): number {
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
  return Math.max(0, m);
}

export function straightLine({ cost, salvage, lifeYears, inService, asOf = new Date() }: StraightLineInput): StraightLineResult {
  const c = Math.max(0, Number(cost) || 0);
  const s = Math.min(c, Math.max(0, Number(salvage) || 0));
  const life = Number(lifeYears) || 0;
  const start = inService ? new Date(inService) : null;
  if (!c || life <= 0 || !start || Number.isNaN(start.getTime())) {
    return { annual: 0, monthly: 0, accumulated: 0, bookValue: round2(c), fullyDepreciated: false };
  }
  const base = c - s;
  const annual = base / life;
  const monthly = annual / 12;
  const months = Math.min(monthsBetween(start, asOf), life * 12);
  const accumulated = Math.min(base, monthly * months);
  return {
    annual: round2(annual),
    monthly: round2(monthly),
    accumulated: round2(accumulated),
    bookValue: round2(c - accumulated),
    fullyDepreciated: months >= life * 12,
  };
}

/** Book value for any asset row: straight-line when switched on, otherwise its cost. Disposed items are worth nothing to the register. */
export function bookValueOf(a: {
  purchasePrice: number | null;
  quantity?: number | null;
  depreciation?: string | null;
  usefulLifeYears?: number | null;
  salvageValue?: number | null;
  inServiceDate?: Date | string | null;
  purchaseDate?: Date | string | null;
  status?: string | null;
}, asOf = new Date()): { cost: number; book: number } {
  if (a.status === "disposed" || a.status === "lost") return { cost: 0, book: 0 };
  const qty = Math.max(1, Number(a.quantity) || 1);
  const unit = Number(a.purchasePrice) || 0;
  if (a.depreciation !== "straight-line") return { cost: round2(unit * qty), book: round2(unit * qty) };
  const r = straightLine({ cost: unit, salvage: a.salvageValue, lifeYears: a.usefulLifeYears, inService: a.inServiceDate ?? a.purchaseDate, asOf });
  return { cost: round2(unit * qty), book: round2(r.bookValue * qty) };
}

export type ScheduleYear = { year: number; opening: number; charge: number; closing: number };

/** Year-by-year schedule from the in-service year until it reaches its salvage value. */
export function depreciationSchedule(input: Omit<StraightLineInput, "asOf">): ScheduleYear[] {
  const c = Math.max(0, Number(input.cost) || 0);
  const start = input.inService ? new Date(input.inService) : null;
  const life = Number(input.lifeYears) || 0;
  if (!c || !start || Number.isNaN(start.getTime()) || life <= 0) return [];
  const out: ScheduleYear[] = [];
  const firstYear = start.getUTCFullYear();
  let opening = c;
  for (let y = firstYear; y <= firstYear + Math.ceil(life) + 1 && out.length < 60; y++) {
    const closing = straightLine({ ...input, asOf: new Date(Date.UTC(y + 1, 0, 1)) }).bookValue;
    const charge = round2(opening - closing);
    out.push({ year: y, opening: round2(opening), charge, closing });
    opening = closing;
    if (charge <= 0 && y > firstYear) { out.pop(); break; }
  }
  return out;
}
