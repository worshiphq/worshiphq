import type { Song } from "../types";
import { makeSong, rtfToText, songFromTextFile } from "./song-import";

/**
 * Songs saved by other software: OpenLP, OpenLyrics and OpenSong (XML), FreeShow (.show), ProPresenter 5–7,
 * VideoPsalm, SongBeamer (.sng), ChordPro, and plain text. What can't be read gives an empty list.
 */
export function songsFromFile(fileName: string, ext: string, text: string): Song[] {
  try {
    const t = text.trim();
    switch (ext) {
      case "show": return freeShow(fileName, t);
      case "pro5": case "pro6": return proPresenterXml(fileName, t);
      case "pro": return t.startsWith("<") ? proPresenterXml(fileName, t) : /\{(title|t|c|comment|soc|start_of)\b/i.test(t) && !t.includes("{\\rtf") ? chordPro(fileName, t) : proPresenter7(fileName, text);
      case "cho": case "crd": case "chopro": case "chordpro": return chordPro(fileName, t);
      case "sng": return songBeamer(fileName, t);
      case "json": case "vpagd": return videoPsalm(t);
      case "xml": case "": return xmlSong(fileName, t);
      default: { const s = songFromTextFile(fileName, text); return s ? [s] : []; }
    }
  } catch {
    return [];
  }
}

const song = (title: string, author: string, parts: { label: string; words: string }[], order: string[] = []): Song[] => {
  const good = parts.filter((p) => p.words.trim());
  if (!good.length) return [];
  const block = (p: { label: string; words: string }) => `[${p.label}]\n${p.words.trim()}`;
  // Repeats are written as a heading with no words.
  const seen = new Set<string>();
  const seq = order.map((o) => good.find((p) => p.label === o)).filter((p): p is (typeof good)[number] => !!p);
  const list = seq.length ? [...seq, ...good.filter((p) => !seq.includes(p))] : good;
  const out = list.map((p) => { if (seen.has(p.label) && seq.length) return `[${p.label}]`; seen.add(p.label); return block(p); });
  return [makeSong(title, author, out.join("\n\n"), ["imported"])];
};

const PART: Record<string, string> = { v: "Verse", c: "Chorus", p: "Pre-chorus", b: "Bridge", t: "Tag", e: "Ending", i: "Intro", o: "Outro" };
/** "v1" → "Verse 1", "c" → "Chorus" */
const partName = (code: string) => {
  const m = code.trim().match(/^([a-z])[a-z]*\s*(\d*)/i);
  return m && PART[m[1].toLowerCase()] && code.trim().length <= 4 ? `${PART[m[1].toLowerCase()]}${m[2] ? ` ${m[2]}` : ""}` : code.trim() || "Verse";
};
const xml = (t: string) => {
  const d = new DOMParser().parseFromString(t.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/, ""), "text/xml");
  if (d.querySelector("parsererror")) throw new Error("xml");
  return d;
};
const first = (d: Document | Element, tag: string) => d.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";

/** OpenLP keeps only the words as XML. */
export function openLpSong(title: string, author: string, words: string): Song | null {
  if (!words.trim().startsWith("<")) return words.trim() ? makeSong(title, author, words, ["imported"]) : null;
  const d = xml(words);
  const parts = [...d.getElementsByTagName("verse")].map((v) => ({
    label: partName(`${v.getAttribute("type") ?? "v"}${v.getAttribute("label") ?? ""}`),
    words: (v.textContent ?? "").replace(/\{\/?[^}]*\}/g, "").replace(/\[---\]/g, "\n"),
  }));
  return song(title, author, parts)[0] ?? null;
}

function xmlSong(name: string, t: string): Song[] {
  if (!t.startsWith("<") && !t.startsWith("﻿<")) return [];
  const d = xml(t);
  const root = d.documentElement;
  // OpenSong: <song><title/><lyrics>[V1]\n words…</lyrics></song>
  if (root.tagName === "song" && d.getElementsByTagName("verse").length === 0) {
    const parts: { label: string; words: string }[] = [];
    for (const raw of first(d, "lyrics").split("\n")) {
      const h = raw.match(/^\s*\[([^\]]+)\]/);
      if (h) { parts.push({ label: partName(h[1]), words: "" }); continue; }
      // "." lines are chords, ";" comments, "|" and "_" layout marks.
      if (/^[.;]/.test(raw)) continue;
      if (!parts.length) { if (!raw.trim()) continue; parts.push({ label: "Verse 1", words: "" }); }
      parts[parts.length - 1].words += `${raw.replace(/^\s*\d?\s?/, "").replace(/[|_]+/g, "").trim()}\n`;
    }
    return song(first(d, "title") || name, first(d, "author"), parts);
  }
  // OpenLyrics
  const verses = [...d.getElementsByTagName("verse")];
  if (!verses.length) return [];
  const parts = verses.map((v) => ({
    label: partName(v.getAttribute("name") ?? "v"),
    words: [...v.getElementsByTagName("lines")].map((l) => {
      const c = l.cloneNode(true) as Element;
      [...c.getElementsByTagName("br")].forEach((b) => b.replaceWith("\n"));
      [...c.getElementsByTagName("comment")].forEach((b) => b.remove());
      return (c.textContent ?? "").split("\n").map((x) => x.trim()).join("\n");
    }).join("\n"),
  }));
  const order = first(d, "verseOrder").split(/\s+/).filter(Boolean).map(partName);
  return song(first(d, "title") || name, [...d.getElementsByTagName("author")].map((a) => a.textContent?.trim()).filter(Boolean).join(", "), parts, order);
}

function freeShow(name: string, t: string): Song[] {
  const j = JSON.parse(t);
  const show = Array.isArray(j) ? j[1] : j;
  if (!show?.slides) return [];
  const layout = show.layouts?.[show.settings?.activeLayout] ?? Object.values(show.layouts ?? {})[0];
  const ids: string[] = (layout as any)?.slides?.map((s: any) => s.id) ?? Object.keys(show.slides);
  const words = (id: string) => (show.slides[id]?.items ?? []).flatMap((i: any) => (i.lines ?? []).map((l: any) => (l.text ?? []).map((x: any) => x.value ?? "").join(""))).join("\n");
  const count: Record<string, number> = {};
  const known = new Map<string, string>();
  const parts: { label: string; words: string }[] = [], order: string[] = [];
  for (const id of ids) {
    const sl = show.slides[id];
    if (!sl) continue;
    if (!known.has(id)) {
      const g = String(sl.globalGroup ?? sl.group ?? "Verse").replace(/_/g, "-").replace(/\s*\d+$/, "").replace(/^./, (c: string) => c.toUpperCase());
      count[g] = (count[g] ?? 0) + 1;
      const label = /^verse$/i.test(g) || count[g] > 1 ? `${g} ${count[g]}` : g;
      known.set(id, label);
      parts.push({ label, words: [id, ...(sl.children ?? [])].map(words).filter((x) => x.trim()).join("\n\n") });
    }
    order.push(known.get(id)!);
  }
  return song(show.name || name, show.meta?.author || show.meta?.artist || "", parts, order);
}

const fromBase64 = (b: string) => { const s = atob(b.trim()); try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); } catch { return s; } };

function proPresenterXml(name: string, t: string): Song[] {
  const d = xml(t);
  const groups = [...d.getElementsByTagName("RVSlideGrouping")];
  const parts = groups.map((g, i) => ({
    label: (g.getAttribute("name") || `Part ${i + 1}`).trim(),
    words: [...g.getElementsByTagName("RVDisplaySlide")].map((s) => {
      // 6: <NSString rvXMLIvarName="RTFData">base64; 5: RTFData="base64" on the text element.
      const six = [...s.getElementsByTagName("NSString")].filter((x) => x.getAttribute("rvXMLIvarName") === "RTFData").map((x) => x.textContent ?? "");
      const five = [...s.getElementsByTagName("RVTextElement")].map((x) => x.getAttribute("RTFData") ?? "").filter(Boolean);
      return (six.length ? six : five).map((b) => rtfToText(fromBase64(b))).join("\n").trim();
    }).filter(Boolean).join("\n\n"),
  }));
  const root = d.documentElement;
  return song(root.getAttribute("CCLISongTitle") || name, root.getAttribute("CCLIAuthor") || root.getAttribute("CCLIArtistCredits") || "", parts);
}

/** ProPresenter 7 is binary: the words are RTF pieces inside it (its part names aren't). */
function proPresenter7(name: string, t: string): Song[] {
  const out: string[] = [];
  for (let at = t.indexOf("{\\rtf"); at >= 0; at = t.indexOf("{\\rtf", at + 1)) {
    let depth = 0, i = at;
    for (; i < t.length; i++) {
      if (t[i] === "\\") { i++; continue; }
      if (t[i] === "{") depth++;
      else if (t[i] === "}" && --depth === 0) break;
    }
    const words = rtfToText(t.slice(at, i + 1)).trim();
    if (words && !out.includes(words)) out.push(words);
    at = i;
  }
  return song(name, "", out.map((words, i) => ({ label: `Verse ${i + 1}`, words })));
}

function chordPro(name: string, t: string): Song[] {
  const tag = (k: string) => t.match(new RegExp(`\\{(?:${k}):\\s*([^}]*)\\}`, "i"))?.[1].trim() ?? "";
  const parts: { label: string; words: string }[] = [];
  let verse = 0;
  const add = (label: string) => parts.push({ label, words: "" });
  for (const raw of t.split(/\r?\n/)) {
    const d = raw.trim().match(/^\{([a-z_]+)(?::\s*([^}]*))?\}$/i);
    if (d) {
      const k = d[1].toLowerCase();
      if (/^(soc|start_of_chorus)$/.test(k)) add(d[2]?.trim() || "Chorus");
      else if (/^(sov|start_of_verse)$/.test(k)) add(d[2]?.trim() || `Verse ${++verse}`);
      else if (/^(sob|start_of_bridge)$/.test(k)) add(d[2]?.trim() || "Bridge");
      else if (/^(c|comment)$/.test(k) && /^(verse|chorus|bridge|pre|tag|intro|ending|outro)/i.test(d[2] ?? "")) add(d[2]!.replace(/:\s*$/, "").trim());
      else if (/^(eoc|eov|eob|end_of_\w+)$/.test(k)) parts.push({ label: "", words: "" });
      continue;
    }
    if (raw.startsWith("#")) continue;
    const words = raw.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();
    if (!words) { if (parts.length && !parts[parts.length - 1].label.match(/./)) continue; if (parts.length && parts[parts.length - 1].words.trim()) parts[parts.length - 1].words += "\n"; continue; }
    if (!parts.length || !parts[parts.length - 1].label) add(`Verse ${++verse}`);
    parts[parts.length - 1].words += `${words}\n`;
  }
  return song(tag("title|t") || name, tag("artist|composer|lyricist|subtitle|st"), parts);
}

function songBeamer(name: string, t: string): Song[] {
  const head = (k: string) => t.match(new RegExp(`^#${k}=(.*)$`, "mi"))?.[1].trim() ?? "";
  const blocks = t.split(/^---*\s*$/m).slice(1);
  let n = 0;
  const parts = blocks.map((b) => {
    const lines = b.trim().split(/\r?\n/);
    const m = lines[0]?.match(/^(verse|strophe|chorus|refrain|bridge|pre-?chorus|intro|ending|outro|tag|part|teil)\s*(\d*)\s*$/i);
    const name = m ? m[1].toLowerCase().replace("strophe", "verse").replace("refrain", "chorus").replace("teil", "part") : "";
    return { label: m ? `${name[0].toUpperCase()}${name.slice(1)}${m[2] ? ` ${m[2]}` : ""}` : `Verse ${++n}`, words: (m ? lines.slice(1) : lines).join("\n") };
  });
  const order = head("VerseOrder").split(",").map((x) => x.trim()).filter(Boolean);
  return song(head("Title") || name, head("Author"), parts, order);
}

/** VideoPsalm writes JSON with line breaks and unquoted names. */
function videoPsalm(t: string): Song[] {
  const fixed = t.replace(/"(?:[^"\\]|\\.)*"/gs, (s) => s.replace(/\r?\n/g, "\\n").replace(/\t/g, "\\t")).replace(/([{,]\s*)([A-Za-z]\w*)\s*:/g, '$1"$2":');
  const j = JSON.parse(fixed);
  const TAG: Record<number, string> = { 0: "Verse", 1: "Chorus", 2: "Bridge", 3: "Pre-chorus", 4: "Ending" };
  return (j.Songs ?? []).flatMap((s: any) => song(String(s.Text ?? "Song"), String(s.Author ?? ""), (s.Verses ?? []).map((v: any, i: number) => ({
    label: v.Tag && TAG[v.Tag] ? TAG[v.Tag] : `Verse ${v.ID ?? i + 1}`,
    words: String(v.Text ?? "").replace(/<[^>]+>/g, "").replace(/\[[A-G][^\]]{0,8}\]/g, ""),
  }))));
}
