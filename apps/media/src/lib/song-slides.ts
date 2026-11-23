import { akanFontToUnicode, cssFont } from "./rich-text";
import type { ServiceItem, Slide, Song } from "../types";
import { textToSections } from "./song-text";
import { DEFAULT_TEMPLATES, applyTemplate } from "./slide-templates";

/**
 * One slide per stanza, following the song's running order (Verse 1, Chorus, Verse 2, Chorus…).
 * A section with a blank line in it is split into two slides so text stays large and readable.
 */
export function buildSongSlides(song: Song): Slide[] {
  const font = song.font ? cssFont(song.font) : undefined;
  // The translation, stanza by stanza, under the same section names (e.g. Twi under English).
  const second = new Map<string, string[]>();
  const chords = new Map<string, string[]>();
  if (song.chords?.trim()) {
    for (const sec of textToSections(song.chords).sections) chords.set(sec.label.toLowerCase(), sec.lyrics.split(/\n\s*\n/).map((x) => x.replace(/^\n+|\s+$/g, "")).filter((x) => x.trim()));
  }
  if (song.translation?.trim()) {
    const t = textToSections(song.translation);
    for (const sec of t.sections) second.set(sec.label.toLowerCase(), sec.lyrics.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean));
  }
  const template = DEFAULT_TEMPLATES.find((t) => t.id === "midnight-blue") ?? DEFAULT_TEMPLATES[0];
  const slides: Slide[] = [];
  for (const sectionId of song.order) {
    const section = song.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    const stanzas = section.lyrics.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    stanzas.forEach((text, i) => {
      const slide = applyTemplate(template, { primaryText: song.akan ? akanFontToUnicode(text) : text });
      slide.type = "song";
      if (font) slide.font = font;
      if (song.background) slide.background = song.background;
      const tr = second.get(section.label.toLowerCase())?.[i];
      const ch = chords.get(section.label.toLowerCase())?.[i];
      if (ch) slide.chords = ch;
      if (tr) slide.second = { text: song.akan ? akanFontToUnicode(tr) : tr, label: song.translationName ?? "" };
      slide.label = stanzas.length > 1 ? `${section.label} (${i + 1}/${stanzas.length})` : section.label;
      slides.push(slide);
    });
  }
  return slides;
}

export function songToServiceItem(song: Song): ServiceItem {
  return {
    id: crypto.randomUUID(),
    type: "song",
    title: song.title,
    subtitle: [song.author, song.key ? `Key of ${song.key}` : null].filter(Boolean).join(" · ") || undefined,
    order: 0,
    data: { songId: song.id },
    slides: buildSongSlides(song),
  };
}
