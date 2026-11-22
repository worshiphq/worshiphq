import { BIBLE_BOOKS } from "../types";

/** Chapters per book, in canonical order (Genesis → Revelation). */
export const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31,
  12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22,
] as const;

export const OLD_TESTAMENT_COUNT = 39;

/** Short book names for the compact book grid. */
export const SHORT_BOOKS = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1 Sam", "2 Sam",
  "1 Kgs", "2 Kgs", "1 Chr", "2 Chr", "Ezra", "Neh", "Esth", "Job", "Psalms", "Prov",
  "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
  "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
  "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1 Cor", "2 Cor", "Gal", "Eph",
  "Phil", "Col", "1 Thess", "2 Thess", "1 Tim", "2 Tim", "Titus", "Phlm", "Heb", "James",
  "1 Pet", "2 Pet", "1 John", "2 John", "3 John", "Jude", "Rev",
] as const;

export interface ScriptureRef {
  /** 0-based index into BIBLE_BOOKS */
  book: number;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

/** Short names people actually type. Anything not listed falls back to prefix matching. */
const ALIASES: Record<string, string> = {
  gen: "Genesis", ge: "Genesis", gn: "Genesis",
  ex: "Exodus", exo: "Exodus", exod: "Exodus",
  lev: "Leviticus", lv: "Leviticus",
  num: "Numbers", nm: "Numbers", nb: "Numbers",
  deut: "Deuteronomy", dt: "Deuteronomy", deu: "Deuteronomy",
  josh: "Joshua", jos: "Joshua",
  judg: "Judges", jdg: "Judges", jg: "Judges",
  ru: "Ruth", rth: "Ruth",
  ps: "Psalms", psa: "Psalms", psalm: "Psalms", pslm: "Psalms", pss: "Psalms",
  prov: "Proverbs", pr: "Proverbs", prv: "Proverbs",
  eccl: "Ecclesiastes", ecc: "Ecclesiastes", qoh: "Ecclesiastes",
  song: "Song of Solomon", sos: "Song of Solomon", sng: "Song of Solomon", songofsongs: "Song of Solomon", canticles: "Song of Solomon",
  isa: "Isaiah", is: "Isaiah",
  jer: "Jeremiah", je: "Jeremiah",
  lam: "Lamentations",
  ezek: "Ezekiel", eze: "Ezekiel", ezk: "Ezekiel",
  dan: "Daniel", dn: "Daniel",
  hos: "Hosea",
  jl: "Joel",
  am: "Amos",
  obad: "Obadiah", ob: "Obadiah",
  jon: "Jonah", jnh: "Jonah",
  mic: "Micah",
  nah: "Nahum",
  hab: "Habakkuk",
  zeph: "Zephaniah", zep: "Zephaniah",
  hag: "Haggai",
  zech: "Zechariah", zec: "Zechariah",
  mal: "Malachi",
  mt: "Matthew", matt: "Matthew", mat: "Matthew",
  mk: "Mark", mrk: "Mark", mar: "Mark",
  lk: "Luke", luk: "Luke",
  jn: "John", jhn: "John", joh: "John",
  ac: "Acts", act: "Acts",
  rom: "Romans", ro: "Romans", rm: "Romans",
  gal: "Galatians", ga: "Galatians",
  eph: "Ephesians",
  phil: "Philippians", php: "Philippians", pp: "Philippians", philippian: "Philippians",
  col: "Colossians",
  tit: "Titus",
  phlm: "Philemon", philem: "Philemon", phm: "Philemon",
  heb: "Hebrews",
  jas: "James", jm: "James", jam: "James",
  jud: "Jude", jd: "Jude",
  rev: "Revelation", re: "Revelation", revelations: "Revelation", rv: "Revelation",
  // numbered books (number is stripped and re-added below)
  sam: "Samuel", sa: "Samuel", sm: "Samuel",
  kgs: "Kings", ki: "Kings", kin: "Kings",
  chr: "Chronicles", chron: "Chronicles", ch: "Chronicles",
  cor: "Corinthians", co: "Corinthians",
  thess: "Thessalonians", th: "Thessalonians", thes: "Thessalonians",
  tim: "Timothy", ti: "Timothy", tm: "Timothy",
  pet: "Peter", pe: "Peter", pt: "Peter",
  jo: "John",
};

const NUMBER_WORDS: Record<string, string> = {
  first: "1", "1st": "1", i: "1", one: "1",
  second: "2", "2nd": "2", ii: "2", two: "2",
  third: "3", "3rd": "3", iii: "3", three: "3",
};

function normalize(s: string) {
  return s.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

/** Split "1 cor" / "1cor" / "first corinthians" into number + name. */
function splitNumber(raw: string): { num: string; name: string } {
  const s = normalize(raw);
  const m = s.match(/^([123])\s*([a-z].*)$/);
  if (m) return { num: m[1], name: m[2].trim() };
  const w = s.match(/^(first|second|third|1st|2nd|3rd|iii|ii|i|one|two|three)\s+([a-z].*)$/);
  if (w) return { num: NUMBER_WORDS[w[1]], name: w[2].trim() };
  return { num: "", name: s };
}

/** All books whose name matches what has been typed so far (for suggestions). */
export function matchBooks(raw: string, limit = 6): number[] {
  const { num, name } = splitNumber(raw);
  if (!name) return [];
  const compact = name.replace(/\s/g, "");
  const results: number[] = [];

  const alias = ALIASES[compact];
  BIBLE_BOOKS.forEach((book, i) => {
    const lower = book.toLowerCase();
    const bookNum = lower.match(/^([123]) /)?.[1] ?? "";
    const bookName = lower.replace(/^[123] /, "");
    if (num && bookNum !== num) return;
    const nameMatches =
      bookName.replace(/\s/g, "").startsWith(compact) ||
      (alias && alias.toLowerCase() === bookName);
    if (nameMatches) results.push(i);
  });

  // Exact alias hit goes first (e.g. "jn" → John before Jonah)
  if (alias) {
    results.sort((a, b) => {
      const an = BIBLE_BOOKS[a].toLowerCase().replace(/^[123] /, "") === alias.toLowerCase() ? 0 : 1;
      const bn = BIBLE_BOOKS[b].toLowerCase().replace(/^[123] /, "") === alias.toLowerCase() ? 0 : 1;
      return an - bn;
    });
  }
  return results.slice(0, limit);
}

/**
 * Understands the ways people type a reference:
 * "John 3:16", "jn 3 16", "1 cor 13:4-7", "Psalm 23", "phil 4.6-7", "first john 1 9".
 */
export function parseReference(input: string): ScriptureRef | null {
  const s = normalize(input).replace(/[–—]/g, "-").replace(/[:\s-]+$/, "");
  // Book words may start with 1/2/3 ("1cor", "2 kings"); word numbers ("first john") are handled by splitNumber.
  const m = s.match(/^([1-3]?\s*[a-z][a-z0-9 ]*?)\s*(\d+)(?:\s*[:\s]\s*(\d+)(?:\s*-\s*(\d+))?)?\s*$/);
  if (!m) return null;
  const book = matchBooks(m[1], 1)[0];
  if (book === undefined) return null;

  // One-chapter books (Jude, Philemon, Obadiah, 2–3 John): "Jude 24" means verse 24.
  if (CHAPTER_COUNTS[book] === 1 && !m[3]) {
    return { book, chapter: 1, verseStart: parseInt(m[2], 10) };
  }
  const chapter = Math.min(Math.max(parseInt(m[2], 10), 1), CHAPTER_COUNTS[book]);
  const verseStart = m[3] ? parseInt(m[3], 10) : undefined;
  let verseEnd = m[4] ? parseInt(m[4], 10) : undefined;
  if (verseStart && verseEnd && verseEnd < verseStart) verseEnd = undefined;
  return { book, chapter, verseStart, verseEnd };
}

export function formatReference(ref: ScriptureRef): string {
  // "Psalm 23", not "Psalms 23", when naming a single psalm.
  const name = BIBLE_BOOKS[ref.book] === "Psalms" ? "Psalm" : BIBLE_BOOKS[ref.book];
  const base = `${name} ${ref.chapter}`;
  if (!ref.verseStart) return base;
  if (ref.verseEnd && ref.verseEnd !== ref.verseStart) return `${base}:${ref.verseStart}–${ref.verseEnd}`;
  return `${base}:${ref.verseStart}`;
}
