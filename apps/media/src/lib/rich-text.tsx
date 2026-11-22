import type { ReactNode } from "react";

/**
 * Coloured words in song lyrics, like EasyWorship: the editor wraps the chosen words as {#e11d48}Jesus{/}.
 * Everything else is plain text.
 */
const COLOURED = /\{#([0-9a-fA-F]{6})\}([\s\S]*?)\{\/\}/g;

export function hasColours(text: string): boolean {
  COLOURED.lastIndex = 0;
  return COLOURED.test(text);
}

/** The words with colour marks removed (for search, the stage display, lists). */
export function plainText(text: string): string {
  return text.replace(COLOURED, "$2").replace(/\{#[0-9a-fA-F]{6}\}|\{\/\}/g, "");
}

/** Words with their colours, ready to put on screen. */
export function richText(text: string): ReactNode {
  if (!text.includes("{")) return text;
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(COLOURED)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(<span key={k++} style={{ color: `#${m[1]}` }}>{m[2]}</span>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

/** Wraps the selected part of `text` in a colour (or removes colours from it when colour is null). */
export function colourSelection(text: string, start: number, end: number, colour: string | null): { text: string; start: number; end: number } {
  if (start === end) return { text, start, end };
  const before = text.slice(0, start);
  const middle = plainText(text.slice(start, end));
  const after = text.slice(end);
  if (!colour) return { text: before + middle + after, start, end: start + middle.length };
  // Colour line by line so the slide breaks and headings stay intact.
  const hex = colour.replace("#", "").toLowerCase();
  const wrapped = middle.split("\n").map((line) => (line.trim() && !/^\s*\[[^\]]+\]\s*$/.test(line) ? `{#${hex}}${line}{/}` : line)).join("\n");
  return { text: before + wrapped + after, start, end: start + wrapped.length };
}

/* ───────────── Akan (Twi) letters ───────────── */

/**
 * Old Akan fonts (e.g. "Akan Times New Roman") draw ɛ where you type j, and ɔ where you type c.
 * Words typed that way show the right letters in any font after this.
 */
export function akanFontToUnicode(text: string): string {
  // Keep the colour marks ({#…} / {/}) and headings untouched.
  return text.replace(/(\{#[0-9a-fA-F]{6}\}|\{\/\}|^\s*\[[^\]]+\]\s*$)|([jcJC])/gm, (all, keep, ch) =>
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

/** A font name as CSS (quoted, with a sensible fallback). */
export function cssFont(name: string): string {
  return name.includes(",") ? name : `'${name.replace(/'/g, "")}', 'Segoe UI', sans-serif`;
}

/** Whether the name is an old-style Akan font (j = ɛ, c = ɔ). */
export function isAkanFont(name: string | undefined): boolean {
  return !!name && /akan|asante|twi/i.test(name);
}
