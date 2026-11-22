import { BIBLE_BOOKS } from "../types";
import { CHAPTER_COUNTS, matchBooks, type ScriptureRef } from "./scripture-ref";

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORDINAL: Record<string, string> = { first: "1", second: "2", third: "3", "1st": "1", "2nd": "2", "3rd": "3" };

function below100(t: string[], i: number): { value: number; next: number } | null {
  if (TENS[t[i]] !== undefined) {
    const ones = SMALL[t[i + 1]];
    if (ones !== undefined && ones > 0 && ones < 10) return { value: TENS[t[i]] + ones, next: i + 2 };
    return { value: TENS[t[i]], next: i + 1 };
  }
  if (SMALL[t[i]] !== undefined) return { value: SMALL[t[i]], next: i + 1 };
  if (/^\d+$/.test(t[i] ?? "")) return { value: parseInt(t[i], 10), next: i + 1 };
  return null;
}

function parseNumber(t: string[], i: number): { value: number; next: number } | null {
  if ((t[i] === "one" || t[i] === "a") && t[i + 1] === "hundred") {
    let j = i + 2;
    if (t[j] === "and" && below100(t, j + 1)) j++;
    const rest = below100(t, j);
    return rest ? { value: 100 + rest.value, next: rest.next } : { value: 100, next: j };
  }
  return below100(t, i);
}

/** "first corinthians thirteen verses four to seven" → "1 corinthians 13 verses 4 to 7" */
export function wordsToNumbers(text: string): string {
  const t = text.toLowerCase().replace(/[-–—]/g, " ").replace(/[^a-z0-9: ]/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < t.length;) {
    if (ORDINAL[t[i]] && i + 1 < t.length && matchBooks(t[i + 1], 1).length) {
      out.push(ORDINAL[t[i]]);
      i++;
      continue;
    }
    const n = parseNumber(t, i);
    if (n && !(t[i] === "a" && n.value === 0)) {
      out.push(String(n.value));
      i = n.next;
    } else {
      out.push(t[i]);
      i++;
    }
  }
  return out.join(" ");
}

/** Last word of each book's name, as people say it ("corinthians", "psalm", "solomon"…). */
function bookWords(book: number): string[] {
  const name = BIBLE_BOOKS[book].toLowerCase().replace(/^[123] /, "");
  const words = [name.split(" ").pop()!];
  if (book === 18) words.push("psalm", "psalms");
  if (book === 21) words.push("songs", "song");
  if (book === 65) words.push("revelations");
  if (book === 49) words.push("philippian");
  return words;
}

/** Builds a reference from what the Windows recognizer heard, using the book it picked. */
export function referenceFromHeard(text: string, book: number): ScriptureRef | null {
  const tokens = wordsToNumbers(text).split(" ");
  const names = bookWords(book);
  let at = -1;
  tokens.forEach((tok, i) => { if (names.includes(tok)) at = i; });
  const nums = tokens.slice(at + 1).filter((x) => /^\d+$/.test(x)).map(Number);
  if (!nums.length) return null;
  const chapter = Math.min(Math.max(nums[0], 1), CHAPTER_COUNTS[book]);
  if (CHAPTER_COUNTS[book] === 1 && nums.length === 1) return { book, chapter: 1, verseStart: nums[0] };
  return { book, chapter, verseStart: nums[1], verseEnd: nums[2] && nums[2] > (nums[1] ?? 0) ? nums[2] : undefined };
}

/** Exact book names and common short forms only, so ordinary words don't look like books. */
function strictBook(raw: string): number | null {
  const words = raw.trim().split(/\s+/);
  const num = /^[123]$/.test(words[0]) ? words.shift()! : "";
  const name = words.join(" ");
  if (!name) return null;
  for (let b = 0; b < BIBLE_BOOKS.length; b++) {
    const full = BIBLE_BOOKS[b].toLowerCase();
    const bNum = full.match(/^([123]) /)?.[1] ?? "";
    const bName = full.replace(/^[123] /, "");
    if (bNum !== num) continue;
    if (bName === name || bookWords(b).includes(name)) return b;
  }
  return null;
}

/** Looks for a reference inside free speech, e.g. "…as it says in John 3 16 that…". */
export function referenceInSpeech(text: string): ScriptureRef | null {
  const s = wordsToNumbers(text);
  // Windows often hears a lone "Psalm 23" as "some 23".
  const psalm = s.match(/^(?:some|sam|psalm|psalms|songs)\s+(\d{1,3})(?:\s+(?:verse\s+)?(\d{1,3}))?$/);
  if (psalm) return { book: 18, chapter: Math.min(+psalm[1], 150), verseStart: psalm[2] ? +psalm[2] : undefined };

  const re = /\b((?:[123] )?[a-z]+(?: of [a-z]+)?) (?:chapter )?(\d{1,3})(?: ?(?::|verses?|and verse|from verse) ?(\d{1,3})| (\d{1,3}))?(?: (?:to|through) (\d{1,3}))?/g;
  for (const m of s.matchAll(re)) {
    const book = strictBook(m[1]);
    if (book === null) continue;
    const chapter = +m[2];
    const verse = m[3] ?? m[4];
    // One-chapter books: "Jude 24" means verse 24.
    if (CHAPTER_COUNTS[book] === 1 && !verse) return { book, chapter: 1, verseStart: chapter };
    if (chapter < 1 || chapter > CHAPTER_COUNTS[book]) continue;
    return { book, chapter, verseStart: verse ? +verse : undefined, verseEnd: m[5] ? +m[5] : undefined };
  }
  return null;
}

/**
 * "verses four to seven" is sometimes heard as "verse forty seven". If that verse doesn't exist
 * in the chapter, read it as a range (4–7) instead.
 */
export function fixImpossibleVerse(ref: ScriptureRef, versesInChapter: number): ScriptureRef {
  const v = ref.verseStart;
  if (!v || v <= versesInChapter || versesInChapter === 0) return ref;
  const tens = Math.floor(v / 10), ones = v % 10;
  if (v >= 21 && v <= 99 && ones > tens && ones <= versesInChapter) {
    return { ...ref, verseStart: tens, verseEnd: ones };
  }
  return { ...ref, verseStart: Math.min(v, versesInChapter), verseEnd: undefined };
}
