/**
 * Shared year ranges for date/year pickers across the app. Church record-keeping
 * can reach well into the past and a little into the future, so we offer a wide
 * but sensible span everywhere instead of just the last few years.
 */
export const YEAR_MIN = 1980;
export const YEAR_MAX = 2050;

/** Years from YEAR_MAX down to YEAR_MIN (newest first). */
export function wideYears(min = YEAR_MIN, max = YEAR_MAX): number[] {
  const out: number[] = [];
  for (let y = max; y >= min; y--) out.push(y);
  return out;
}
