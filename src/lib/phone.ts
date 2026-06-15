/**
 * Normalise a Ghana (or international) phone number to the digits-only format
 * SMS providers expect, e.g. "024 123 4567" / "+233241234567" → "233241234567".
 */
export function normalisePhone(raw: string): string {
  let p = (raw ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "233" + p.slice(1); // 0XXXXXXXXX → 233XXXXXXXXX
  else if (p.length === 9) p = "233" + p; // 9-digit local → add country code
  return p;
}

/** True if it looks like a usable phone number after normalising. */
export function isValidPhone(raw: string): boolean {
  return normalisePhone(raw).length >= 11;
}
