import type { BibleVerse, Slide } from "../types";
import { DEFAULT_TEMPLATES, applyTemplate } from "./slide-templates";

/** Most words we put on one screen before starting a new part. */
const MAX_WORDS_PER_SLIDE = 55;

/** Backgrounds offered on the Bible screen (ids from DEFAULT_TEMPLATES). */
export const SCRIPTURE_BACKGROUNDS = [
  { id: "classic-dark", label: "Black" },
  { id: "midnight-blue", label: "Blue" },
  { id: "warm-earth", label: "Warm" },
  { id: "forest-green", label: "Green" },
] as const;

export type TextSize = "auto" | "small" | "medium" | "large";

export interface ScriptureStyle {
  backgroundId: string;
  textSize: TextSize;
  showTranslation: boolean;
}

export const DEFAULT_SCRIPTURE_STYLE: ScriptureStyle = {
  backgroundId: "classic-dark",
  textSize: "auto",
  showTranslation: true,
};

/** Smaller type for longer passages so nothing runs off the screen. */
export function fontSizeFor(text: string, size: TextSize = "auto"): number {
  if (size === "small") return 40;
  if (size === "medium") return 52;
  if (size === "large") return 66;
  const n = text.length;
  if (n <= 90) return 72;
  if (n <= 180) return 62;
  if (n <= 300) return 52;
  if (n <= 450) return 44;
  return 38;
}

/**
 * Turns chosen verses into projector slides. Short passages stay on one slide;
 * long ones are split between verses into parts of roughly the same size.
 */
export function buildScriptureSlides(
  verses: BibleVerse[],
  reference: string,
  translation: string | undefined,
  style: ScriptureStyle = DEFAULT_SCRIPTURE_STYLE,
): Slide[] {
  const groups: BibleVerse[][] = [];
  let current: BibleVerse[] = [];
  let words = 0;
  for (const v of verses) {
    const w = v.text.split(/\s+/).length;
    if (current.length && words + w > MAX_WORDS_PER_SLIDE) {
      groups.push(current);
      current = [];
      words = 0;
    }
    current.push(v);
    words += w;
  }
  if (current.length) groups.push(current);

  const template = DEFAULT_TEMPLATES.find((t) => t.id === style.backgroundId) ?? DEFAULT_TEMPLATES[0];
  const label = translation && style.showTranslation ? `${reference} · ${translation}` : reference;
  const showNumbers = verses.length > 1;

  return groups.map((group, i) => {
    const text = group.map((v) => (showNumbers ? `${v.verse} ${v.text}` : v.text)).join(" ");
    const slide = applyTemplate(template, { primaryText: text, secondaryText: label });
    slide.type = "scripture";
    const first = group[0].verse, last = group[group.length - 1].verse;
    slide.label = groups.length > 1 ? `Part ${i + 1} · v${first}${last !== first ? `–${last}` : ""}` : reference;
    slide.template.textLayout = "center";
    slide.template.fontSize = fontSizeFor(text, style.textSize);
    return slide;
  });
}
