/**
 * Normalise a Ghana (or international) phone number to the digits-only format
 * SMS providers expect, e.g. "024 123 4567" / "+233241234567" -> "233241234567".
 */
export function normalisePhone(raw: string): string {
  let p = (raw ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "233" + p.slice(1); // 0XXXXXXXXX -> 233XXXXXXXXX
  else if (p.length === 9) p = "233" + p; // 9-digit local -> add country code
  return p;
}

/**
 * Simple phone number format validation:
 *  - 0XXXXXXXXX  (10 digits starting with 0 - Ghana local)
 *  - 233XXXXXXXXX (12 digits starting with 233)
 *  - +233XXXXXXXXX (+ then 12 digits)
 *  - +<international> (+ then 7-15 digits per E.164)
 */
export function isValidPhone(raw: string): boolean {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+")) {
    const d = digits.slice(1).replace(/\D/g, "");
    return d.length >= 7 && d.length <= 15;
  }
  const d = digits.replace(/\D/g, "");
  if (d.startsWith("0")) return d.length === 10;
  if (d.startsWith("233")) return d.length === 12;
  return d.length >= 7 && d.length <= 15;
}

export function phoneValidityMessage(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return isValidPhone(trimmed)
    ? ""
    : "Enter a valid phone number, e.g. 0241234567 or +233241234567";
}

/**
 * Every stored form a phone number might legitimately be saved as, so a lookup
 * matches accounts whose phone was saved un-normalised by an older path
 * (e.g. "0247258161" vs "233247258161" vs "+233247258161"). Use with
 * `where: { phone: { in: phoneVariants(input) } }`.
 */
export function phoneVariants(raw: string): string[] {
  const set = new Set<string>();
  const norm = normalisePhone(raw); // 233XXXXXXXXX
  if (norm) {
    set.add(norm);
    set.add("+" + norm);
    if (norm.startsWith("233") && norm.length === 12) {
      set.add("0" + norm.slice(3)); // local 0XXXXXXXXX
      set.add(norm.slice(3));       // 9-digit XXXXXXXXX
    }
  }
  const rawDigits = (raw ?? "").replace(/[^\d+]/g, "");
  if (rawDigits) set.add(rawDigits);
  return [...set].filter(Boolean);
}
