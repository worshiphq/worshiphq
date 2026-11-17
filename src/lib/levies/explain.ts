// Plain-English explanations of levy figures. Every number a church sees comes with a sentence saying where it came from.
import { ZERO, fmtGhs, fmtRate } from "./money";
import { addDays, shortDate } from "./periods";
import type { LevyComputation, LevyLine, LevyStatus } from "./types";

/** "1 to 14 Mar" for a part-period line. */
function rangeText(fromYmd: string, toYmdExclusive: string): string {
  const last = addDays(toYmdExclusive, -1);
  const [a, b] = [shortDate(fromYmd), shortDate(last)];
  const sameMonth = fromYmd.slice(0, 7) === last.slice(0, 7);
  return fromYmd === last ? a : sameMonth ? `${a.split(" ")[0]} to ${b}` : `${a} to ${b}`;
}

/**
 * "10% of GH₵12,400.00 Tithes = GH₵1,240.00"
 * "5% of GH₵11,160.00 Tithes left after Head Office share = GH₵558.00"
 * "12% of GH₵3,000.00 Tithes (15 to 31 Mar) = GH₵360.00"
 */
export function explainLine(line: LevyLine, afterName?: string | null, fixedPeriodLabel?: string): string {
  if (line.kind === "fixed") return explainFixed(line.levyCents, fixedPeriodLabel);
  const range = line.partial ? ` (${rangeText(line.fromYmd, line.toYmd)})` : "";
  const left = line.afterCents > ZERO || afterName ? ` left after ${afterName ?? "the other levy"}` : "";
  return `${fmtRate(line.rateUnits)} of ${fmtGhs(line.baseCents)} ${line.label}${left}${range} = ${fmtGhs(line.levyCents)}`;
}

export function explainFixed(cents: bigint, periodLabel?: string): string {
  return `Fixed amount${periodLabel ? ` for ${periodLabel}` : ""} = ${fmtGhs(cents)}`;
}

/** "Worked out as GH₵320.00, raised to the minimum of GH₵500.00." */
export function explainCap(c: Pick<LevyComputation, "cap" | "rawCents">): string | null {
  if (!c.cap) return null;
  return c.cap.kind === "min"
    ? `Worked out as ${fmtGhs(c.rawCents)}, raised to the minimum of ${fmtGhs(c.cap.limitCents)}.`
    : `Worked out as ${fmtGhs(c.rawCents)}, capped at the maximum of ${fmtGhs(c.cap.limitCents)}.`;
}

/** One sentence for a whole computation: the lines joined, plus any cap. */
export function explainComputation(c: LevyComputation, opts: { afterName?: string | null; periodLabel?: string } = {}): string {
  if (c.lines.length === 0) return "Nothing to charge for this period.";
  const parts = c.lines.map((l) => explainLine(l, opts.afterName, opts.periodLabel));
  const cap = explainCap(c);
  return parts.join(". ") + (cap ? `. ${cap}` : "");
}

export const STATUS_TONE: Record<LevyStatus, "success" | "warning" | "danger" | "info" | "default"> = {
  counting: "info",
  nothing_due: "default",
  waived: "default",
  paid: "success",
  credit: "success",
  part_paid: "warning",
  overdue: "danger",
  unpaid: "warning",
};

/** Badge text: "Paid", "Part paid, overdue", "Due 15 Dec", "Still counting". */
export function statusText(status: LevyStatus, opts: { dueYmd: string; partPaid?: boolean; thisYear?: number }): string {
  switch (status) {
    case "counting": return "Still counting";
    case "nothing_due": return "Nothing due";
    case "waived": return "Waived";
    case "paid": return "Paid";
    case "credit": return "Paid extra";
    case "part_paid": return `Part paid, due ${shortDate(opts.dueYmd, opts.thisYear)}`;
    case "overdue": return opts.partPaid ? "Part paid, overdue" : "Overdue";
    default: return `Due ${shortDate(opts.dueYmd, opts.thisYear)}`;
  }
}

export const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  momo: "Mobile Money",
  bank: "Bank transfer",
  cheque: "Cheque",
  deducted: "Taken off by the receiver",
};

export const PAYEE_KINDS: { value: string; label: string }[] = [
  { value: "hq", label: "Head office" },
  { value: "district", label: "District" },
  { value: "area", label: "Area" },
  { value: "region", label: "Region" },
  { value: "denomination", label: "Denomination" },
  { value: "mission", label: "Mission or fund" },
  { value: "other", label: "Someone else" },
];
