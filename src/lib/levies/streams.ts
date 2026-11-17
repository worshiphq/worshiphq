// Income streams a levy can be worked out on. Pure.
import type { StreamKey } from "./types";

/** Ledger categories that are never income (moving money between the church's own accounts). */
export const EXCLUDED_CATEGORIES = ["Transfer"];

export const GENERAL_GIVING = "fund:none";

export function streamKeyForGift(fundId: string | null | undefined): StreamKey {
  return fundId ? `fund:${fundId}` : GENERAL_GIVING;
}

/** Other income posted to the accounts (Day Born, Harvest, Pledges, Welfare, Facility hire...). Null for transfers. */
export function streamKeyForTxn(fund: string | null | undefined, category: string | null | undefined): StreamKey | null {
  if (category && EXCLUDED_CATEGORIES.includes(category)) return null;
  const label = (fund || category || "").trim();
  return label ? `ledger:${label}` : null;
}

/** "Tithes", "General giving", "Day Born". */
export function streamLabel(key: StreamKey, fundNames: Map<string, string> | Record<string, string>): string {
  if (key === GENERAL_GIVING) return "General giving";
  if (key.startsWith("fund:")) {
    const id = key.slice(5);
    const name = fundNames instanceof Map ? fundNames.get(id) : fundNames[id];
    return name ?? "A removed fund";
  }
  if (key.startsWith("ledger:")) return key.slice(7);
  return key;
}

export function isValidStreamKey(key: string): boolean {
  return key === GENERAL_GIVING || /^fund:[A-Za-z0-9_-]{1,64}$/.test(key) || /^ledger:.{1,80}$/.test(key);
}
