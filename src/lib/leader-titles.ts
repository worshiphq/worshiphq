/** The standard leadership titles. A church that has not made its own list uses these. */
export const DEFAULT_LEADER_TITLES = [
  "Head Pastor", "Senior Pastor", "Associate Pastor", "Assistant Pastor", "Youth Pastor", "Worship Pastor",
  "Elder", "Deacon", "Deaconess", "Shepherd", "Minister", "Evangelist", "Bishop", "Apostle", "Prophet",
];

export const MAX_LEADER_TITLES = 40;
export const MAX_LEADER_TITLE_LENGTH = 40;

/** One title, tidied: no extra spaces, not too long. Empty when there is nothing usable. */
export function cleanLeaderTitle(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LEADER_TITLE_LENGTH);
}

/** A list of titles, tidied, without repeats (capital letters do not make a new title) and not too long. */
export function cleanLeaderTitles(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const t = cleanLeaderTitle(item);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_LEADER_TITLES) break;
  }
  return out;
}

/** The titles a church picks from: its own list, or the standard one when it has not made its own. */
export function leaderTitleList(stored: string[] | null | undefined): string[] {
  const own = cleanLeaderTitles(stored ?? []);
  return own.length ? own : [...DEFAULT_LEADER_TITLES];
}

/**
 * Where a title sits in the church's own list (0 is the most senior), for ordering leaders. Returns null when the church has
 * not made its own list, so the built-in ordering applies; a title that is not on the list comes last.
 */
export function ownLeaderTitleRank(stored: string[] | null | undefined, title: string | null | undefined): number | null {
  const own = cleanLeaderTitles(stored ?? []);
  if (!own.length) return null;
  if (!title) return 99;
  const i = own.findIndex((t) => t.toLowerCase() === title.toLowerCase());
  return i === -1 ? 99 : i;
}
