import type { ReactNode } from "react";

/**
 * Coloured words and words in another font, like in Word or EasyWorship. People never see this: the song editor
 * shows the colours and fonts themselves. Behind the scenes a run of words is kept as
 *   {#e11d48}Jesus{/}                         a colour
 *   {|Akan Times New Roman}Onyame{/}          a font
 *   {#e11d48|Akan Times New Roman}Yesu{/}     both
 */
const RUN = /\{(?:#([0-9a-fA-F]{6}))?(?:\|([^{}|\n]+))?\}([\s\S]*?)\{\/\}/g;

export interface Run { text: string; color?: string; font?: string }

/** Splits text into runs of the same colour and font. */
export function parseRuns(text: string): Run[] {
  const out: Run[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    if (!m[1] && !m[2]) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[3], color: m[1] ? `#${m[1].toLowerCase()}` : undefined, font: m[2]?.trim() || undefined });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Runs back into text (neighbouring runs that look the same are joined; a run never crosses a line). */
export function runsToText(runs: Run[]): string {
  const merged: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.color === r.color && prev.font === r.font) prev.text += r.text;
    else merged.push({ ...r });
  }
  return merged
    .map((r) => {
      if (!r.color && !r.font) return r.text;
      const open = `{${r.color ? r.color.toLowerCase() : ""}${r.font ? `|${r.font}` : ""}}`;
      return r.text.split("\n").map((line) => (line ? `${open}${line}{/}` : line)).join("\n");
    })
    .join("");
}

export function hasFormatting(text: string): boolean {
  return parseRuns(text).some((r) => r.color || r.font);
}

/** The words without colours or fonts (for search, the stage display, lists). */
export function plainText(text: string): string {
  return parseRuns(text).map((r) => r.text).join("");
}

/** A font name as CSS (quoted, with a sensible fallback). */
export function cssFont(name: string): string {
  return name.includes(",") ? name : `'${name.replace(/'/g, "")}', 'Segoe UI', sans-serif`;
}

/** Words with their colours and fonts, ready to put on screen. */
export function richText(text: string): ReactNode {
  if (!text.includes("{")) return text;
  const runs = parseRuns(text);
  if (!runs.some((r) => r.color || r.font)) return text;
  return runs.map((r, i) =>
    r.color || r.font ? <span key={i} style={{ color: r.color, fontFamily: r.font ? cssFont(r.font) : undefined }}>{r.text}</span> : r.text,
  );
}

/* ───────────── Akan (Twi) letters ───────────── */

/**
 * Old Akan fonts draw ɛ where you type j, and ɔ where you type c. Imported words typed that way are changed to the
 * real letters, so they show correctly in any font.
 */
export function akanFontToUnicode(text: string): string {
  return text.replace(/(\{[^{}\n]*\}|^\s*\[[^\]]+\]\s*$)|([jcJC])/gm, (all, keep, ch) =>
    keep ? keep : ({ j: "ɛ", c: "ɔ", J: "Ɛ", C: "Ɔ" } as Record<string, string>)[ch] ?? all,
  );
}

export const AKAN_LETTERS = ["ɛ", "ɔ", "Ɛ", "Ɔ"];

/* ───────────── Fonts installed on this computer ───────────── */

let systemFonts: Promise<string[]> | null = null;

/** Every font installed on this computer (asked once). */
export function listSystemFonts(): Promise<string[]> {
  if (!systemFonts) {
    systemFonts = (async () => {
      if (!(window as any).__TAURI_INTERNALS__) return [];
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string[]>("list_fonts").catch(() => []);
    })();
  }
  return systemFonts;
}

/** Whether the name is an old-style Akan font (j = ɛ, c = ɔ). */
export function isAkanFont(name: string | undefined): boolean {
  return !!name && /akan|asante|twi/i.test(name);
}
