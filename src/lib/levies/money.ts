// Integer money for levies. Everything is worked out in pesewas (cents) as BigInt, so no float ever decides a figure.

export const ZERO = BigInt(0);
export const ONE = BigInt(1);
const TEN = BigInt(10);
const HUNDRED = BigInt(100);
/** rate units are rate x 10000; levy = cents x units / RATE_DIV (100% = 1,000,000 units). */
export const RATE_DIV = BigInt(1_000_000);

/** Integer division rounding half away from zero. */
export function roundHalfUp(num: bigint, den: bigint): bigint {
  if (den === ZERO) throw new Error("Division by zero");
  const neg = (num < ZERO) !== (den < ZERO);
  const a = num < ZERO ? -num : num;
  const b = den < ZERO ? -den : den;
  const q = (a * BigInt(2) + b) / (b * BigInt(2));
  return neg ? -q : q;
}

/** Parse a decimal string or number into an integer scaled by 10^places, rounding half up. */
function scaled(v: number | string | { toString(): string } | null | undefined, places: number): bigint {
  if (v === null || v === undefined || v === "") return ZERO;
  let s = typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(places + 2) : "0") : String(v).trim();
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === "" || s === "-" || s === ".") s = "0";
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [intPart, frac = ""] = s.split(".");
  const keep = (frac + "0".repeat(places + 1)).slice(0, places + 1);
  const whole = BigInt((intPart || "0") + keep); // one extra digit for rounding
  const r = roundHalfUp(whole, TEN);
  return neg ? -r : r;
}

/** "1240.50", 1240.5 or a Prisma Decimal to pesewas. */
export function toCents(v: number | string | { toString(): string } | null | undefined): bigint {
  return scaled(v, 2);
}

/** Pesewas to "1240.50". */
export function fromCents(c: bigint): string {
  const neg = c < ZERO;
  const a = neg ? -c : c;
  const whole = a / HUNDRED;
  const frac = (a % HUNDRED).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export const centsToNumber = (c: bigint) => Number(fromCents(c));

/** A percent (10, "12.5") to rate units (rate x 10000). */
export function rateUnits(rate: number | string | { toString(): string } | null | undefined): bigint {
  return scaled(rate, 4);
}

/** Rate units to a short percent: 100000 -> "10%", 125000 -> "12.5%". */
export function fmtRate(units: bigint): string {
  const neg = units < ZERO;
  const a = neg ? -units : units;
  const whole = a / BigInt(10000);
  const frac = (a % BigInt(10000)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}%`;
}

/** Pesewas to "GH₵1,240.00". */
export function fmtGhs(c: bigint): string {
  const [w, f] = fromCents(c < ZERO ? -c : c).split(".");
  return `${c < ZERO ? "-" : ""}GH₵${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}

/** Number amounts (as sent by the client) to "GH₵1,240.00". */
export const fmtGhsNumber = (n: number) => fmtGhs(toCents(n));

export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
