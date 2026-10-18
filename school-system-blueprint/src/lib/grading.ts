export interface Band {
  grade: string;
  label: string;
  remark?: string | null;
  minScore: number;
  maxScore: number;
  isPass: boolean;
}

export interface Component {
  id: string;
  maxScore: number; // what the teacher marks against
  weight: number; // points contributed to the 100 total
}

/** Scales each raw score to its weight and sums: (raw / max) * weight. Missing components count as 0 only when `strict` is false. */
export function computeTotal(
  components: Component[],
  raw: Record<string, number | null | undefined>,
  { strict = false }: { strict?: boolean } = {},
): number | null {
  let total = 0;
  for (const c of components) {
    const v = raw[c.id];
    if (v == null) {
      if (strict) return null;
      continue;
    }
    if (v < 0 || v > c.maxScore) throw new RangeError(`Score ${v} outside 0–${c.maxScore}`);
    total += (v / c.maxScore) * c.weight;
  }
  return Math.round(total * 100) / 100;
}

/** Bands must cover 0–100 without gaps; the first band whose range contains the (rounded) score wins. */
export function gradeFor(total: number, bands: Band[]): Band | undefined {
  const t = Math.round(total);
  return bands.find((b) => t >= b.minScore && t <= b.maxScore);
}

/** Standard competition ranking: equal totals share a position, next position skips (1,2,2,4). */
export function rank<T>(items: T[], score: (t: T) => number | null): Map<T, number | null> {
  const scored = items
    .map((item) => ({ item, s: score(item) }))
    .filter((x): x is { item: T; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s);
  const out = new Map<T, number | null>(items.map((i) => [i, null]));
  let position = 0;
  let prev: number | null = null;
  scored.forEach((x, i) => {
    if (prev === null || x.s !== prev) position = i + 1;
    out.set(x.item, position);
    prev = x.s;
  });
  return out;
}

export function ordinal(n: number): string {
  const v = n % 100;
  const s = ["th", "st", "nd", "rd"];
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
