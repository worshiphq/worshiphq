/** Words that add nothing to a short sender name. */
const FILLER = new Set(["the", "of", "and", "church", "chapel", "ministries", "ministry", "international", "inc", "ltd", "assembly", "congregation"]);

/**
 * A suggested SMS sender name (3 to 11 letters and numbers, no spaces) made from a church's name, for example
 * "Grace Baptist Church, Santasi" becomes "GraceBaptis". It is only a suggestion shown as a hint.
 */
export function suggestSenderId(churchName: string): string {
  const words = churchName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
  const pick = meaningful.length ? meaningful : words;
  const cased = pick.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  // A sender name can be 11 characters at most.
  const id = cased.join("").slice(0, 11);
  if (id.length < 3 || /^\d+$/.test(id)) return "";
  return id;
}
