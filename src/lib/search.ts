/**
 * One way to search for people everywhere (tithes, giving, attendance, pickers, lists):
 * by name (every word you type must match, in any order), by member ID, by email, and by phone number
 * however it is written (0241234567, 024 123 4567, +233241234567 all find the same person).
 */

/** Digits only, with the country code or leading zero removed, so every way of writing a number compares equal. */
export function phoneKey(input: string | null | undefined): string {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("233") && d.length > 9) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export type SearchTarget = {
  name?: string | null;
  phone?: string | null;
  memberId?: string | null;
  email?: string | null;
  /** Any other text to match words against (a hint, a department, a school...). */
  text?: string | null;
};

const isNumberish = (t: string) => /^[+\d][\d\s\-()]*$/.test(t) && t.replace(/\D/g, "").length >= 2;

/** Every digit run in a piece of text, as phone keys (so a phone written inside a label can still be found). */
function phonesIn(text: string): string[] {
  return (text.match(/\+?\d[\d\s\-()]{6,}\d/g) ?? []).map(phoneKey);
}

/** True when the query finds this person. An empty query matches everyone. */
export function matchesPerson(query: string, p: SearchTarget): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const words = [p.name, p.memberId, p.email, p.text].filter(Boolean).join(" ").toLowerCase();
  const phones = [phoneKey(p.phone), ...phonesIn(p.text ?? "")].filter(Boolean);

  // A phone number may contain spaces ("024 123 4567"), so try the whole query as a number first.
  if (isNumberish(q)) {
    const key = phoneKey(q);
    if (key.length >= 3 && phones.some((ph) => ph.includes(key))) return true;
  }
  return q.split(/\s+/).every((tok) => {
    if (words.includes(tok)) return true;
    if (isNumberish(tok)) {
      const key = phoneKey(tok);
      return key.length >= 3 && phones.some((ph) => ph.includes(key));
    }
    return false;
  });
}
