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
  /** A background picked for this slide (Background button), instead of the look's. */
  background?: { kind: "image" | "video" | "gradient" | "color" | "camera"; value: string };
  /** This slide's own font (e.g. a song's font), instead of the look's. */
  font?: string;
  /** Chords for this part of a song (stage display only, never on the main screen). */
  chords?: string;
  /** A designed slide (slide editor): text boxes, pictures and shapes placed anywhere, over the background. */
  elements?: SlideElement[];
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

/** One thing on a designed slide. Positions and sizes are in projector pixels (1920 × 1080). */
export interface SlideElement {
  id: string;
  kind: "text" | "image" | "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  /** text */
  text?: string;
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  shadow?: boolean;
  /** shape fill / text box background */
  fill?: string;
  radius?: number;
  /** image */
  src?: string;
  fit?: "cover" | "contain";
  opacity?: number;
}

export interface SlideMedia {
  /** camera = a live camera or capture card (deviceId says which). */
  kind: "image" | "video" | "camera";
  deviceId?: string;
  /** Video: play from / stop at (seconds), fade in and out, and go on to the next slide when it ends. */
  start?: number;
  end?: number;
  fade?: boolean;
  next?: boolean;
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
  /** Search results: which Bible it was found in, and whether the AI suggested it (meaning, not wording). */
  abbreviation?: string;
  ai?: boolean;
  why?: string;
}

export interface Song {
  id: string;
  title: string;
  author?: string;
  key?: string;
  sections: SongSection[];
  order: string[];
  tags: string[];
  /** Font for this song's words (a font name); empty = the font chosen in Look & fonts. */
  font?: string;
  /** Words typed for an old Akan font: show j as ɛ and c as ɔ. */
  akan?: boolean;
  /** The background this song always uses (picked with the Background button while the song was in Preview). */
  background?: { kind: "image" | "video" | "gradient" | "color" | "camera"; value: string };
  /** The same song in a second language (same [Verse]/[Chorus] layout), shown under the words. */
  translation?: string;
  /** Name of the second language, e.g. "Twi". */
  translationName?: string;
  /** CCLI song number, for licence reports. */
  ccli?: string;
  /** Chord chart for the musicians (same [Verse]/[Chorus] layout). Shown on the stage display only. */
  chords?: string;
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
