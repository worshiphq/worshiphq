import type { Song, SongSection } from "../types";

/**
 * Songs are edited as plain text with simple headings:
 *
 *   [Verse 1]
 *   Amazing grace how sweet the sound
 *   ...
 *
 *   [Chorus]
 *   ...
 *
 *   [Chorus]        <- a heading with no words repeats that part
 *
 * Headings can also be written without brackets ("Chorus:" or "Verse 2").
 */

const HEADING =
  /^\s*\[?\s*((?:verse|chorus|pre[- ]?chorus|bridge|tag|intro|outro|ending|refrain|interlude|hook|vamp|coda|instrumental)(?:\s*\d+)?)\s*\]?\s*:?\s*$/i;
const BRACKETED = /^\s*\[([^\]]{1,30})\]\s*$/;

function tidyLabel(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ").replace(/^pre[- ]?chorus/i, "Pre-chorus");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function songToText(song: Song): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const id of song.order) {
    const sec = song.sections.find((s) => s.id === id);
    if (!sec) continue;
    if (seen.has(id)) parts.push(`[${sec.label}]`);
    else parts.push(`[${sec.label}]\n${sec.lyrics.trim()}`);
    seen.add(id);
  }
  // Parts not used in the running order are still kept.
  for (const sec of song.sections) {
    if (!seen.has(sec.id)) parts.push(`[${sec.label}]\n${sec.lyrics.trim()}`);
  }
  return parts.join("\n\n");
}

export function textToSections(text: string): { sections: SongSection[]; order: string[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: SongSection[] = [];
  const order: string[] = [];
  let current: { label: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const lyrics = current.lines.join("\n").replace(/^\n+|\n+$/g, "");
    const key = current.label.toLowerCase();
    const existing = sections.find((s) => s.label.toLowerCase() === key);
    if (!lyrics && existing) {
      order.push(existing.id); // repeat of an earlier part
    } else if (lyrics) {
      if (existing && existing.lyrics === lyrics) {
        order.push(existing.id);
      } else {
        const label = existing ? `${current.label} (${sections.filter((s) => s.label.toLowerCase().startsWith(key)).length + 1})` : current.label;
        const sec: SongSection = { id: `s${sections.length + 1}`, label, lyrics, order: sections.length };
        sections.push(sec);
        order.push(sec.id);
      }
    }
    current = null;
  };

  for (const line of lines) {
    const m = line.match(HEADING) ?? line.match(BRACKETED);
    if (m) {
      flush();
      current = { label: tidyLabel(m[1]), lines: [] };
    } else {
      if (!current) {
        if (!line.trim()) continue;
        current = { label: sections.length ? `Part ${sections.length + 1}` : "Verse 1", lines: [] };
      }
      current.lines.push(line);
    }
  }
  flush();
  return { sections, order };
}

export const NEW_SONG_TEXT = `[Verse 1]


[Chorus]

`;
