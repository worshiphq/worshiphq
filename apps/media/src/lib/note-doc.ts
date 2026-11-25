import type { Slide, SlideElement } from "../types";
import { buildTextItem } from "./text-slides";

/**
 * Sermon notes are one open page of text, typed in freely. What each line is comes from how it is written:
 * the first ordinary line is the title; "1. …" is a point; "- …" belongs to the point above it; anything else is
 * a line of its own (a verse, a saying).
 */
export type LineKind = "title" | "point" | "sub" | "line";
export interface DocLine { kind: LineKind; text: string; raw: string; at: number; no?: number }

const POINT = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const SUB = /^\s*[-•–*]\s+(.*)$/;

export function readDoc(text: string): DocLine[] {
  const out: DocLine[] = [];
  let at = 0, seenAny = false;
  for (const raw of text.split("\n")) {
    const p = raw.match(POINT), s = raw.match(SUB), t = raw.trim();
    if (p) out.push({ kind: "point", no: +p[1], text: p[2].trim(), raw, at });
    else if (s) out.push({ kind: "sub", text: s[1].trim(), raw, at });
    else if (t) out.push({ kind: seenAny || /^[ 	]/.test(raw) ? "line" : "title", text: t, raw, at });
    // An indented line (a verse shown before the title was said) doesn’t take the title’s place.
    if (t && !/^[ 	]/.test(raw)) seenAny = true;
    at += raw.length + 1;
  }
  return out;
}

export const docTitle = (text: string) => readDoc(text).find((l) => l.kind === "title")?.text ?? "";

/** Writes a new note at its place: the title at the top, everything else at the end. Nothing already written changes. */
export function addNote(text: string, kind: LineKind | "verse", note: string): string {
  const t = note.replace(/\s+/g, " ").trim();
  if (!t) return text;
  if (kind === "title") return docTitle(text) ? text : `${t}\n\n${text.replace(/^\n+/, "")}`;
  const lines = readDoc(text);
  const points = lines.filter((l) => l.kind === "point");
  const body =
    kind === "point" ? `${Math.max(0, ...points.map((p) => p.no ?? 0)) + 1}. ${t}`
    : kind === "sub" ? `   - ${t}`
    : kind === "line" ? `   “${t.replace(/^["“]|["”]$/g, "")}”`
    : `   ${t}`;
  const base = text.replace(/\n+$/, "");
  if (!base.trim()) return `\n${body}\n`;       // the top line stays free for the title
  const gap = kind === "point" && lines[lines.length - 1]?.kind === "title" ? "\n\n" : "\n";
  return `${base}${gap}${body}\n`;
}

/** The line the cursor is on. */
export function lineAt(text: string, pos: number): DocLine | null {
  let found: DocLine | null = null;
  for (const l of readDoc(text)) if (l.at <= pos && pos <= l.at + l.raw.length) found = l;
  return found;
}

/** The point the cursor is in (itself, or the one a sub-point belongs to), with what is under it. */
export function pointAt(text: string, pos: number): DocLine[] {
  const lines = readDoc(text);
  let i = -1;
  lines.forEach((l, k) => { if (l.at <= pos) i = k; });
  while (i >= 0 && lines[i].kind !== "point") i--;
  if (i < 0) return [];
  let j = i + 1;
  while (j < lines.length && lines[j].kind === "sub") j++;
  return lines.slice(i, j);
}

const W = 1600, ROOM = 760, NARROW = 0.5;
const height = (lines: string[], size: number) => lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * size * NARROW) / W)), 0) * size * 1.28;

let n = 0;
const el = (over: Partial<SlideElement>): SlideElement => ({ id: `note-${++n}`, kind: "text", x: 160, y: 0, w: W, h: 100, color: "#ffffff", ...over });

/**
 * Slides for part of the notes: the title at the top (if given) and the lines under it, as big as fits; more than
 * fits goes on to further slides, each with the title.
 */
export function noteSlides(title: string, body: string[], label: string): Slide[] {
  const lines = body.map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  if (!lines.length) return title ? (buildTextItem("announcement", "", title).slides ?? []).map((s) => ({ ...s, label })) : [];
  // One line and no title: an ordinary slide in the church's own look.
  if (!title && lines.length === 1) return (buildTextItem("announcement", "", lines[0].trim()).slides ?? []).map((s) => ({ ...s, label }));

  const room = title ? ROOM : ROOM + 130;
  const MIN = 46;
  const pages: string[][] = [];
  let page: string[] = [];
  for (const l of lines) {
    if (page.length && height([...page, l], MIN) > room) { pages.push(page); page = []; }
    page.push(l);
  }
  pages.push(page);
  return pages.map((p, k) => {
    const size = [112, 100, 92, 84, 76, 70, 64, 58, 52, MIN].find((s) => height(p, s) <= room) ?? MIN;
    const tall = Math.min(room, height(p, size));
    const top = title ? 260 : 150;
    const elements: SlideElement[] = [];
    if (title) elements.push(el({ text: title, y: 70, h: 160, size: title.length > 44 ? 68 : title.length > 28 ? 88 : 108, bold: true, align: "center" }));
    elements.push(el({ text: p.join("\n"), y: Math.round(top + Math.max(0, (room - tall) / 2.6)), h: Math.round(Math.max(tall, size * 1.3)), size, align: p.length > 1 || /^\s*\d/.test(p[0]) ? "left" : "center" }));
    const base = buildTextItem("announcement", "", p.join("\n")).slides![0];
    return { ...base, label: pages.length > 1 ? `${label} (${k + 1})` : label, content: { primaryText: [title, ...p].filter(Boolean).join("\n") }, elements };
  });
}

export const bodyOf = (lines: DocLine[]): string[] => lines.filter((l) => l.kind !== "title").map((l) => (l.kind === "point" ? `${l.no}. ${l.text}` : l.kind === "sub" ? `     – ${l.text}` : l.text));
