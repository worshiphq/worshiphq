import type { ReactNode } from "react";

/**
 * Coloured words and words in another font, like in Word or EasyWorship. People never see this: the song editor
 * shows the colours and fonts themselves. Behind the scenes a run of words is kept as
 *   {#e11d48}Jesus{/}                         a colour
 *   {|Akan Times New Roman}Onyame{/}          a font
 *   {#e11d48|Akan Times New Roman}Yesu{/}     both
 *   {~bi150}…{/}                              bold, italic (u = underlined), 150% size; after any colour and font
 */
const RUN = /\{(?:#([0-9a-fA-F]{6}))?(?:\|([^{}|~\n]+))?(?:~([biu]{0,3}\d{0,3}))?\}([\s\S]*?)\{\/\}/g;

export interface RunLook { color?: string; font?: string; bold?: boolean; italic?: boolean; under?: boolean; /** Percent of the normal size. */ size?: number }
export interface Run extends RunLook { text: string }
export const isPlain = (r: RunLook) => !r.color && !r.font && !r.bold && !r.italic && !r.under && !r.size;
const sameLook = (a: RunLook, b: RunLook) => a.color === b.color && a.font === b.font && !a.bold === !b.bold && !a.italic === !b.italic && !a.under === !b.under && (a.size || 0) === (b.size || 0);
export const runStyle = (r: RunLook) => ({
  color: r.color, fontFamily: r.font ? cssFont(r.font) : undefined, fontWeight: r.bold ? 800 : undefined,
  fontStyle: r.italic ? "italic" : undefined, textDecoration: r.under ? "underline" : undefined, fontSize: r.size ? `${r.size / 100}em` : undefined,
});

/** Splits text into runs of the same colour and font. */
export function parseRuns(text: string): Run[] {
  const out: Run[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    if (!m[1] && !m[2] && !m[3]) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    const o = m[3] ?? "", size = +o.replace(/\D/g, "");
    out.push({
      text: m[4], color: m[1] ? `#${m[1].toLowerCase()}` : undefined, font: m[2]?.trim() || undefined,
      ...(o.includes("b") ? { bold: true } : {}), ...(o.includes("i") ? { italic: true } : {}), ...(o.includes("u") ? { under: true } : {}), ...(size ? { size } : {}),
    });
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
    if (prev && sameLook(prev, r)) prev.text += r.text;
    else merged.push({ ...r });
  }
  return merged
    .map((r) => {
      if (isPlain(r)) return r.text;
      const more = `${r.bold ? "b" : ""}${r.italic ? "i" : ""}${r.under ? "u" : ""}${r.size || ""}`;
      const open = `{${r.color ? r.color.toLowerCase() : ""}${r.font ? `|${r.font}` : ""}${more ? `~${more}` : ""}}`;
      return r.text.split("\n").map((line) => (line ? `${open}${line}{/}` : line)).join("\n");
    })
    .join("");
}

export function hasFormatting(text: string): boolean {
  return parseRuns(text).some((r) => !isPlain(r));
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
  if (runs.every(isPlain)) return text;
  return runs.map((r, i) =>
    isPlain(r) ? r.text : <span key={i} style={runStyle(r)}>{r.text}</span>,
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
