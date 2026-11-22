import type { SlideStyle, Transition } from "./lib/themes";

export interface Slide {
  /** The look this slide is shown with on the projector (attached when it is sent). */
  style?: SlideStyle;
  /** How the projector changes to this slide (attached when it is sent). */
  transition?: Transition;
  /** Name shown to the operator only, e.g. "Chorus" or "Part 2". Never projected. */
  label?: string;
  /** A picture or video that fills the screen (Pictures & videos, church logo). */
  media?: SlideMedia;
  /** Clear (Ctrl+C): show the background only, without the words. */
  hideText?: boolean;
  /** A second Bible version shown under the first (e.g. Twi on top, KJV below). */
  second?: { text: string; label: string };
  /** A countdown clock to this time (ms since 1970). */
  countdownTo?: number;
  type: "scripture" | "song" | "media" | "announcement" | "logo" | "custom";
  content: {
    primaryText: string;
    secondaryText?: string;
    metadata?: string;
  };
  template: {
    background: string | { type: "video"; src: string; loop: boolean } | { type: "image"; src: string };
    textLayout: "center" | "bottom" | "split" | "lower-third";
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
    textShadow?: string;
  };
}

/** A message across the bottom of the projector, e.g. a nursery call. */
export interface AlertMessage {
  text: string;
  /** Scroll across the screen instead of standing still. */
  scroll: boolean;
  background: string;
  color: string;
}

export interface SlideMedia {
  kind: "image" | "video";
  /** File path on this computer (desktop app) or a temporary blob: URL (browser preview). */
  src: string;
  /** "cover" fills the screen (may crop); "contain" shows the whole picture. */
  fit: "cover" | "contain";
  loop?: boolean;
  muted?: boolean;
}

export interface ServiceItem {
  id: string;
  type: "scripture" | "song" | "media" | "announcement" | "custom";
  title: string;
  subtitle?: string;
  order: number;
  /** Planned length in minutes (Service plan screen). */
  minutes?: number;
  /** Private note for the team, e.g. "Pastor prays after this". Never projected. */
  note?: string;
  slides?: Slide[];
  data?: {
    book?: number;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
    translation?: string;
    songId?: string;
    mediaUrl?: string;
  };
}

export interface BibleVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface Song {
  id: string;
  title: string;
  author?: string;
  key?: string;
  sections: SongSection[];
  order: string[];
  tags: string[];
}

export interface SongSection {
  id: string;
  label: string;
  lyrics: string;
  order: number;
}

export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;
