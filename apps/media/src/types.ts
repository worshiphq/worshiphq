export interface Slide {
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

export interface ServiceItem {
  id: string;
  type: "scripture" | "song" | "media" | "announcement" | "custom";
  title: string;
  subtitle?: string;
  order: number;
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
