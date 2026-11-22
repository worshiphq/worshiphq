import { create } from "zustand";
import type { BibleVerse, Slide } from "../types";
import { CHAPTER_COUNTS, formatReference, type ScriptureRef } from "./scripture-ref";
import { buildScriptureSlides } from "./scripture-slides";
import { demoChapter } from "./demo-bible";
import { isDesktopApp } from "./media-src";
import { useBibleStore } from "../stores/bible-store";
import { useProjectionStore } from "../stores/projection-store";

/** The Bible passage that is on screen now, so "next verse", "verse 5" and Back / Next part know where we are. */
export interface PassageOnScreen {
  book: number;
  chapter: number;
  start: number;
  end: number;
  /** Number of verses in that chapter. */
  versesInChapter: number;
  label: string;
  slides: Slide[];
  index: number;
}

export const usePassageStore = create<{ passage: PassageOnScreen | null; set: (p: PassageOnScreen | null) => void }>((set) => ({
  passage: null,
  set: (passage) => set({ passage }),
}));

async function chapterOf(packId: string | null, book: number, chapter: number): Promise<BibleVerse[]> {
  try {
    if (isDesktopApp()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<BibleVerse[]>("bible_get_chapter", { packId, book: book + 1, chapter });
    }
    return demoChapter(book + 1, chapter);
  } catch {
    return [];
  }
}

/**
 * Puts a Bible passage on the screen in the chosen version (and the second version, if one is chosen on the
 * Bible page). Returns the label shown, or null when the passage doesn't exist in this Bible.
 */
export async function showPassage(ref: ScriptureRef): Promise<string | null> {
  const bible = useBibleStore.getState();
  if (!bible.packs.length) await bible.loadPacks();
  const { activePack, packs } = useBibleStore.getState();
  const pack = packs.find((p) => p.id === activePack);
  const chapter = await chapterOf(activePack, ref.book, ref.chapter);
  if (!chapter.length) return null;
  const last = chapter[chapter.length - 1].verse;
  const start = Math.min(Math.max(ref.verseStart ?? 1, 1), last);
  const end = Math.min(Math.max(ref.verseEnd ?? (ref.verseStart ? start : last), start), last);
  const verses = chapter.filter((v) => v.verse >= start && v.verse <= end);
  const ownNames = pack?.book_names?.length === 66 && pack.book_names.every(Boolean) ? pack.book_names : undefined;
  const label = formatReference({ book: ref.book, chapter: ref.chapter, verseStart: start, verseEnd: end === start ? undefined : end }, ownNames);

  let second: { verses: BibleVerse[]; abbreviation: string } | undefined;
  let secondId = "";
  try { secondId = localStorage.getItem("whq-second-version") ?? ""; } catch { /* ignore */ }
  const secondPack = packs.find((p) => p.id === secondId && p.id !== activePack);
  if (secondPack) {
    const sv = (await chapterOf(secondPack.id, ref.book, ref.chapter)).filter((v) => v.verse >= start && v.verse <= end);
    if (sv.length) second = { verses: sv, abbreviation: secondPack.abbreviation };
  }
  const slides = buildScriptureSlides(verses, label, pack?.abbreviation, undefined, second);
  if (!slides.length) return null;
  const proj = useProjectionStore.getState();
  if (isDesktopApp() && !proj.projectionOpen) proj.openProjection();
  proj.goLive(slides[0]);
  usePassageStore.getState().set({ book: ref.book, chapter: ref.chapter, start, end, versesInChapter: last, label, slides, index: 0 });
  return label;
}

/** Next / previous verse, crossing into the next or previous chapter at the ends. */
export async function stepVerse(delta: 1 | -1): Promise<string | null> {
  const p = usePassageStore.getState().passage;
  if (!p) return null;
  if (delta > 0) {
    if (p.end < p.versesInChapter) return showPassage({ book: p.book, chapter: p.chapter, verseStart: p.end + 1 });
    if (p.chapter < CHAPTER_COUNTS[p.book]) return showPassage({ book: p.book, chapter: p.chapter + 1, verseStart: 1 });
    if (p.book < 65) return showPassage({ book: p.book + 1, chapter: 1, verseStart: 1 });
    return null;
  }
  if (p.start > 1) return showPassage({ book: p.book, chapter: p.chapter, verseStart: p.start - 1 });
  if (p.chapter > 1) return showPassage({ book: p.book, chapter: p.chapter - 1, verseStart: 999 });
  if (p.book > 0) return showPassage({ book: p.book - 1, chapter: CHAPTER_COUNTS[p.book - 1], verseStart: 999 });
  return null;
}

/** Back / Next part of a passage that needs more than one slide. Returns false when there is no such part. */
export function stepPart(delta: 1 | -1): boolean {
  const p = usePassageStore.getState().passage;
  if (!p) return false;
  const live = useProjectionStore.getState().currentSlide;
  if (!live || !p.slides.some((s) => s.content.primaryText === live.content.primaryText)) return false;
  const i = p.index + delta;
  if (i < 0 || i >= p.slides.length) return false;
  useProjectionStore.getState().goLive(p.slides[i]);
  usePassageStore.getState().set({ ...p, index: i });
  return true;
}
