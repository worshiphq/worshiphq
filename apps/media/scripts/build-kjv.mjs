#!/usr/bin/env node
/**
 * Downloads the KJV Bible from a public domain source and creates a SQLite DB.
 * Run: node scripts/build-kjv.mjs
 * Output: src-tauri/resources/kjv.db
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = join(__dirname, "..", "src-tauri", "resources");
const DB_PATH = join(RESOURCES_DIR, "kjv.db");

const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1Samuel", "2Samuel",
  "1Kings", "2Kings", "1Chronicles", "2Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "SongofSolomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1Corinthians", "2Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1Thessalonians", "2Thessalonians", "1Timothy", "2Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1Peter", "2Peter", "1John", "2John", "3John",
  "Jude", "Revelation",
];

const BASE_URL = "https://cdn.jsdelivr.net/gh/aruljohn/Bible-kjv@master";

async function fetchBook(bookName, bookIndex) {
  const url = `${BASE_URL}/${bookName}.json`;
  console.log(`  [${bookIndex + 1}/66] ${bookName}...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${bookName}: ${res.status}`);
  const data = await res.json();

  const verses = [];
  const chapters = data.chapters || [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const entries = Object.entries(chapter);
    for (const [verseNum, text] of entries) {
      verses.push({
        book: bookIndex + 1,
        chapter: ci + 1,
        verse: parseInt(verseNum),
        text: text.trim(),
      });
    }
  }
  return verses;
}

async function main() {
  console.log("Building KJV Bible SQLite database...\n");

  if (!existsSync(RESOURCES_DIR)) {
    mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  // Remove existing DB
  if (existsSync(DB_PATH)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX idx_bcv ON verses(book, chapter, verse);
    CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      chapters INTEGER NOT NULL
    );
  `);

  const insertVerse = db.prepare(
    "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)"
  );
  const insertBook = db.prepare(
    "INSERT INTO books (id, name, chapters) VALUES (?, ?, ?)"
  );

  let totalVerses = 0;

  for (let i = 0; i < BOOKS.length; i++) {
    const verses = await fetchBook(BOOKS[i], i);
    const maxChapter = Math.max(...verses.map((v) => v.chapter));

    const displayName = BOOKS[i]
      .replace(/(\d)(.*)/,  "$1 $2")
      .replace("Songof", "Song of ");

    const insertMany = db.transaction((rows) => {
      for (const v of rows) {
        insertVerse.run(v.book, v.chapter, v.verse, v.text);
      }
      insertBook.run(i + 1, displayName, maxChapter);
    });

    insertMany(verses);
    totalVerses += verses.length;
  }

  db.exec("ANALYZE");
  db.close();

  console.log(`\nDone! ${totalVerses.toLocaleString()} verses written to ${DB_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
