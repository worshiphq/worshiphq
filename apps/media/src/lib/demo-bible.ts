import type { BibleVerse } from "../types";

/**
 * A few public-domain (KJV) chapters so the Bible screen works in the browser dev
 * preview, where the desktop app's installed Bible packs aren't available.
 */
const DEMO_CHAPTERS: Record<string, string[]> = {
  // Psalm 23 (book 19)
  "19:23": [
    "The LORD is my shepherd; I shall not want.",
    "He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
    "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
    "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.",
    "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.",
    "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.",
  ],
  // Psalm 117 (book 19)
  "19:117": [
    "O praise the LORD, all ye nations: praise him, all ye people.",
    "For his merciful kindness is great toward us: and the truth of the LORD endureth for ever. Praise ye the LORD.",
  ],
};

export function demoChapter(book1: number, chapter: number): BibleVerse[] {
  const verses = DEMO_CHAPTERS[`${book1}:${chapter}`];
  if (verses) return verses.map((text, i) => ({ book: book1, chapter, verse: i + 1, text }));
  // Placeholder text for every other chapter in the browser preview.
  return Array.from({ length: 12 }, (_, i) => ({
    book: book1,
    chapter,
    verse: i + 1,
    text: "Sample text. The real verse appears here in the desktop app, from the Bible installed on this computer.",
  }));
}
