import type { ServiceItem, Slide, Song } from "../types";
import { DEFAULT_TEMPLATES, applyTemplate } from "./slide-templates";

/**
 * One slide per stanza, following the song's running order (Verse 1, Chorus, Verse 2, Chorus…).
 * A section with a blank line in it is split into two slides so text stays large and readable.
 */
export function buildSongSlides(song: Song): Slide[] {
  const template = DEFAULT_TEMPLATES.find((t) => t.id === "midnight-blue") ?? DEFAULT_TEMPLATES[0];
  const slides: Slide[] = [];
  for (const sectionId of song.order) {
    const section = song.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    const stanzas = section.lyrics.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    stanzas.forEach((text, i) => {
      const slide = applyTemplate(template, { primaryText: text });
      slide.type = "song";
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
