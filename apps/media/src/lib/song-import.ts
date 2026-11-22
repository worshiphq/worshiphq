import type { Song } from "../types";
import { textToSections } from "./song-text";

/** EasyWorship stores song words as RTF. Turn that into plain lines ("Verse 1", words…, blank line…). */
export function rtfToText(rtf: string): string {
  if (!rtf.startsWith("{\\rtf")) return rtf;
  let s = convertAkanRuns(rtf);
  // Drop the header groups (fonts, colours, list styles) — the words start at the first \pard.
  const start = s.indexOf("\\pard");
  if (start >= 0) s = s.slice(start);
  // Line breaks inside the RTF file mean nothing; only \par starts a new line.
  s = s.replace(/[\r\n]/g, "");
  // Unicode characters: ሴ? (the character after it is a fallback to skip).
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)));
  // Windows-1252 characters: \'e9
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => new TextDecoder("windows-1252").decode(new Uint8Array([parseInt(h, 16)])));
  s = s.replace(/\\(par|line)\b ?/g, "\n");
  s = s.replace(/\\tab\b ?/g, " ");
  s = s.replace(/\{\\\*[^{}]*\}/g, "");
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\\\\/g, "\\");
  const lines = s.split(/\r?\n/).map((l) => l.trim());
  const out: string[] = [];
  for (const l of lines) {
    if (!l && (!out.length || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  return out.join("\n").trim();
}

export function makeSong(title: string, author: string, words: string, tags: string[] = []): Song {
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "Untitled song",
    author: author.trim(),
    key: "",
    tags,
    ...textToSections(words),
  };
}

/**
 * A plain text song file. Understands SongSelect "lyrics" text files (title on the first line,
 * then "Verse 1" / "Chorus" headings, CCLI lines at the end) and simple files with just words.
 */
export function songFromTextFile(fileName: string, text: string): Song | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  // Drop CCLI / copyright footer lines.
  const body = lines.filter((l) => !/^(ccli|©|copyright|\(c\)|for use solely|note: reproduction)/i.test(l.trim()));
  let title = fileName.replace(/[_-]+/g, " ").trim();
  // SongSelect: first non-empty line is the title when a heading follows soon after.
  const firstIdx = body.findIndex((l) => l.trim());
  if (firstIdx >= 0) {
    const next = body.slice(firstIdx + 1).find((l) => l.trim());
    if (next && /^\s*\[?(verse|chorus|bridge|pre[- ]?chorus|tag|intro|outro|ending|refrain)/i.test(next)) {
      title = body[firstIdx].trim();
      body.splice(firstIdx, 1);
    }
  }
  const words = body.join("\n").trim();
  if (!words) return null;
  return makeSong(title, "", words, ["imported"]);
}

/**
 * EasyWorship songs typed in an old Akan font store ɛ as "j" and ɔ as "c". Find those fonts in the RTF font
 * table and change the letters typed in them, so the words show correctly in any font.
 */
function convertAkanRuns(rtf: string): string {
  const table = rtf.match(/\{\\fonttbl([\s\S]*?)\}\s*(?:\{\\colortbl|\{\\\*|\\pard|\\viewkind)/)?.[1] ?? "";
  const akan = new Set<string>();
  for (const m of table.matchAll(/\\f(\d+)[^;]*?([^;\\{}]+);/g)) if (/akan|asante|twi/i.test(m[2])) akan.add(m[1]);
  if (!akan.size) return rtf;
  const start = rtf.indexOf("\\pard");
  if (start < 0) return rtf;
  let inAkan = false;
  // Walk the body: control words switch fonts; plain letters in an Akan font are changed.
  const body = rtf.slice(start).replace(/(\\f(\d+)\b ?)|(\\'[0-9a-fA-F]{2}|\\u-?\d+\??|\\[a-zA-Z]+-?\d* ?)|([jcJC])/g, (all, fsw, fnum, ctrl, ch) => {
    if (fsw) { inAkan = akan.has(fnum); return all; }
    if (ctrl) return all;
    if (ch && inAkan) return ({ j: "ɛ", c: "ɔ", J: "Ɛ", C: "Ɔ" } as Record<string, string>)[ch];
    return all;
  });
  return rtf.slice(0, start) + body;
}
