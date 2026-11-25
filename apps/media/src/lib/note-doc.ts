import type { Slide, SlideElement } from "../types";
import { buildTextItem } from "./text-slides";
import { cssFont, hasFormatting, isPlain, parseRuns, plainText, runStyle } from "./rich-text";

/**
 * Sermon notes are one open page of text, typed in freely. "1. …" is a point, "- …" belongs to the point above it,
 * and anything else is just a line. The heading of the message has its own box: no line is ever taken as a title.
 */
export type LineKind = "point" | "sub" | "line";
/** raw = as kept (with colours and fonts); text = only the words. */
export interface DocLine { kind: LineKind; text: string; raw: string; line: number; no?: number }

const POINT = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const SUB = /^\s*[-•–*]\s+(.*)$/;

export function readDoc(text: string): DocLine[] {
  const out: DocLine[] = [];
  text.split("\n").forEach((raw, line) => {
    const words = plainText(raw);
    const p = words.match(POINT), s = words.match(SUB), t = words.trim();
    if (p) out.push({ kind: "point", no: +p[1], text: p[2].trim(), raw, line });
    else if (s) out.push({ kind: "sub", text: s[1].trim(), raw, line });
    else if (t) out.push({ kind: "line", text: t, raw, line });
  });
  return out;
}

/** The same notes tidied: lines that still say the same keep their colours and fonts. */
export function keepLooks(before: string, after: string): string {
  const looks = new Map(readDoc(before).filter((l) => hasFormatting(l.raw)).map((l) => [l.text, l]));
  return after.split("\n").map((raw) => {
    const l = readDoc(raw)[0], was = l && looks.get(l.text);
    return was && was.kind === l.kind && was.no === l.no ? was.raw : raw;
  }).join("\n");
}

/** Points are numbered 1, 2, 3… again after one is added or taken away (left alone if you number them your own way). */
function renumber(text: string, before: string): string {
  const nos = readDoc(before).filter((l) => l.kind === "point").map((l) => l.no!);
  if (nos.some((n, i) => n !== i + 1)) return text;
  let n = 0;
  return text.split("\n").map((l) => (POINT.test(plainText(l)) ? l.replace(/^((?:\{[^{}]*\}|\s)*)\d{1,2}/, (_, s) => `${s}${++n}`) : l)).join("\n");
}

const loose = (l: string) => { const w = plainText(l); return SUB.test(w) || (/^\s{2,}\S/.test(w) && !POINT.test(w)); };

/** Writes a new note: under the line it belongs to, or at the end. Nothing already written changes (but numbers). */
export function addNote(text: string, kind: LineKind | "verse", note: string, underText?: string): string {
  const t = note.replace(/\s+/g, " ").trim();
  if (!t) return text;
  const doc = readDoc(text);
  const no = Math.max(0, ...doc.filter((l) => l.kind === "point").map((p) => p.no ?? 0)) + 1;
  const line = kind === "point" ? `${no}. ${t}` : kind === "sub" ? `   - ${t}` : kind === "verse" ? `   ${t}` : t;
  const under = underText ? doc.find((l) => l.text === underText) : undefined;
  if (under && kind !== "point") {
    const lines = text.split("\n");
    let i = lines.indexOf(under.raw);
    // After everything already under that point.
    while (i + 1 < lines.length && lines[i + 1].trim() && loose(lines[i + 1])) i++;
    lines.splice(i + 1, 0, line);
    return lines.join("\n");
  }
  const base = text.replace(/\s+$/, "");
  return `${base}${base ? "\n" : ""}${line}\n`;
}

/** Rewords (or, with null, removes) the line that says exactly this. */
export function changeLine(text: string, says: string, next: string | null): string {
  const l = readDoc(text).find((x) => x.text === says);
  if (!l || hasFormatting(l.raw)) return text;
  const lines = text.split("\n");
  const i = lines.indexOf(l.raw);
  if (next === null) { lines.splice(i, 1); return renumber(lines.join("\n"), text); }
  lines[i] = l.raw.replace(says, () => next.replace(/\s+/g, " ").trim());
  return lines.join("\n");
}

/** What the cursor is in: a point with what is under it, or the lines between two blank ones. As written. */
export function partAt(text: string, line: number): { no?: number; lines: string[] } | null {
  const all = text.split("\n");
  const i = Math.min(line, all.length - 1);
  if (!all[i]?.trim()) return null;
  const isPoint = (l: string) => POINT.test(plainText(l));
  // A point and what hangs under it.
  let p = i;
  while (p > 0 && loose(all[p])) p--;
  const m = plainText(all[p]).match(POINT);
  if (m) {
    let j = p + 1;
    while (j < all.length && loose(all[j])) j++;
    return { no: +m[1], lines: all.slice(p, j) };
  }
  let a = i, b = i;
  while (a > 0 && all[a - 1].trim() && !isPoint(all[a - 1])) a--;
  while (b + 1 < all.length && all[b + 1].trim() && !isPoint(all[b + 1])) b++;
  return { lines: all.slice(a, b + 1) };
}

export type NoteAlign = "center" | "left" | "right";
/** How notes look on the screen (words with their own colour, font or size keep it). */
export interface NoteLook {
  font: string; color: string; /** 0 = as big as fits. */ size: number; spacing: number; bold: boolean; align: NoteAlign; shadow: boolean;
  headFont: string; headColor: string; headSize: number; headAlign: NoteAlign;
}
export const NOTE_LOOK: NoteLook = { font: "", color: "#ffffff", size: 0, spacing: 1.15, bold: false, align: "center", shadow: true, headFont: "", headColor: "#ffffff", headSize: 0, headAlign: "center" };

const W = 1640, H = 920, MIN = 40;
/** Measured off screen with the real fonts, so nothing is cut off and nothing is smaller than it needs to be. */
let ruler: HTMLDivElement | null = null;
function measure(lines: string[], size: number, spacing: number, font: string, bold: boolean): { w: number; h: number } {
  if (!ruler || !ruler.isConnected) {
    ruler = document.createElement("div");
    ruler.setAttribute("aria-hidden", "true");
    document.body.appendChild(ruler);
  }
  Object.assign(ruler.style, {
    position: "fixed", left: "-9999px", top: "0", visibility: "hidden", width: "max-content", maxWidth: `${W}px`, whiteSpace: "pre-wrap",
    fontFamily: font ? cssFont(font) : "'Segoe UI', sans-serif", fontSize: `${size}px`, lineHeight: String(spacing), fontWeight: bold ? "800" : "500",
  });
  ruler.replaceChildren(...parseRuns(lines.join("\n")).map((r) => {
    if (isPlain(r)) return document.createTextNode(r.text);
    const s = document.createElement("span");
    const st = runStyle(r);
    Object.assign(s.style, { fontFamily: st.fontFamily ?? "", fontWeight: st.fontWeight ? String(st.fontWeight) : "", fontStyle: st.fontStyle ?? "", fontSize: st.fontSize ?? "" });
    s.textContent = r.text;
    return s;
  }));
  return { w: ruler.offsetWidth, h: ruler.offsetHeight };
}

let n = 0;
const el = (over: Partial<SlideElement>): SlideElement => ({ id: `note-${++n}`, kind: "text", x: (1920 - W) / 2, y: 0, w: W, h: 100, color: "#ffffff", ...over });

/**
 * Slides for part of the notes: the heading (if given) and the words under it, as one block in the middle of the
 * screen, with the lines just as you left them. What doesn't fit goes on to further slides.
 */
export function noteSlides(heading: string, body: string[], label: string, look: NoteLook = NOTE_LOOK): Slide[] {
  let lines = body.map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[0].trim()) lines = lines.slice(1);
  while (lines.length && !lines[lines.length - 1].trim()) lines = lines.slice(0, -1);
  if (look.align !== "left") lines = lines.map((l) => l.replace(/^\s+/, ""));
  const head = heading.trim();
  if (!lines.length && !head) return [];
  const gapOf = look.spacing;

  const headSize = look.headSize || (head.length > 46 ? 72 : head.length > 28 ? 92 : 112);
  const headTall = head ? measure([head], headSize, 1.15, look.headFont, true).h + 6 : 0;
  const tall = (ls: string[], size: number) => measure(ls, size, gapOf, look.font, look.bold).h;
  const gap = head && lines.length ? 48 : 0;
  const room = Math.max(200, H - headTall - gap);
  const least = look.size || MIN;
  const pages: string[][] = [];
  let page: string[] = [];
  for (const l of lines) {
    if (page.length && tall([...page, l], least) > room) { pages.push(page); page = []; if (!l.trim()) continue; }
    page.push(l);
  }
  if (page.length || !pages.length) pages.push(page);

  return pages.map((p, k) => {
    const size = look.size || ([128, 112, 100, 90, 82, 74, 66, 58, 52, 46, MIN].find((s) => tall(p, s) <= room && (!head || s < headSize)) ?? MIN);
    const body = p.length ? measure(p, size, gapOf, look.font, look.bold) : { w: 0, h: 0 };
    const bodyTall = body.h;
    const top = Math.max(20, Math.round((1080 - (headTall + gap + bodyTall)) / 2));
    const elements: SlideElement[] = [];
    if (head) elements.push(el({ text: head, y: top, h: Math.round(headTall), size: headSize, bold: true, align: look.headAlign, color: look.headColor, font: look.headFont ? cssFont(look.headFont) : undefined, shadow: look.shadow, lineHeight: 1.15 }));
    if (p.length) {
      // Left-aligned words still sit in the middle: the block is only as wide as its longest line.
      const w = look.align === "left" ? Math.min(W, body.w + 8) : W;
      elements.push(el({ text: p.join("\n"), x: Math.round((1920 - w) / 2), w, y: Math.round(top + headTall + gap), h: Math.round(bodyTall) + 8, size, align: look.align, color: look.color, bold: look.bold, font: look.font ? cssFont(look.font) : undefined, shadow: look.shadow, lineHeight: gapOf }));
    }
    const words = plainText([head, ...p].filter((x) => x.trim()).join("\n"));
    const base = buildTextItem("announcement", "", words).slides![0];
    return { ...base, label: pages.length > 1 ? `${label} (${k + 1})` : label, content: { primaryText: words }, elements };
  });
}

/** The lines as they should be shown: "- " becomes a dash. */
export const shown = (lines: string[]): string[] => lines.map((l) => l.replace(/^((?:\{[^{}]*\}|\s)*)[-•*]\s+/, "$1– "));
