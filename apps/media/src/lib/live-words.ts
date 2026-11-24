import { referenceAt, type SpokenRef } from "./spoken-ref";

/**
 * Word-by-word listening. While someone is talking the last few seconds are transcribed again and again; a word is
 * "sure" once two readings in a row agree on it (and on every word before it). Nothing acts on words that aren't sure.
 */
export const wordKey = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export class LiveWords {
  private last: string[] = [];
  private sureWords: string[] = [];

  /** A new reading of the sentence so far. */
  push(text: string): { sure: string; maybe: string } {
    const now = text.trim().split(/\s+/).filter(Boolean);
    let n = 0;
    while (n < now.length && n < this.last.length && wordKey(now[n]) === wordKey(this.last[n])) n++;
    // Sure words never disappear (that would make the screen jump); a later reading only adds to them.
    if (n > this.sureWords.length) this.sureWords = now.slice(0, n);
    this.last = now;
    return { sure: this.sureWords.join(" "), maybe: now.slice(this.sureWords.length).join(" ") };
  }

  reset() {
    this.last = [];
    this.sureWords = [];
  }
}

/**
 * A Bible reference that is safe to act on while the sentence is still going: it names a verse, and something was
 * said after it. ("Romans 8 verse 2" may be about to become "verse 28", and "verse 4" may become "4 to 7".)
 */
export function settledReference(sure: string): SpokenRef | null {
  const r = referenceAt(sure);
  if (!r || !r.ref.verseStart || r.wordsAfter < 1) return null;
  return /^(?:to|through|and)\b/i.test(r.after) && r.wordsAfter < 3 ? null : r;
}

/** Where to cut a long run of speech: the quietest moment in its last 2 seconds, so a word isn't split. */
export function quietestCut(levels: number[], blocksBack: number): number {
  const from = Math.max(1, levels.length - blocksBack);
  let at = levels.length, low = Infinity;
  for (let i = from; i < levels.length; i++) if (levels[i] < low) { low = levels[i]; at = i; }
  return at;
}
