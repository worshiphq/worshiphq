/** "AST-0001" from the church's running asset number. Numbers past 9999 simply grow longer. */
export function formatTag(seq: number): string {
  return `AST-${String(Math.max(0, Math.floor(seq))).padStart(4, "0")}`;
}

/** Looks like one of our tags (case-insensitive). */
export function isTag(s: string): boolean {
  return /^AST-\d{4,}$/i.test(s.trim());
}
