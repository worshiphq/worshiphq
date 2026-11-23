import { create } from "zustand";
import type { Slide } from "../types";
import { useProjectionStore } from "./projection-store";
import { useThemeStore } from "./theme-store";
import { themeKindFor } from "../lib/themes";

/**
 * Preview and Live, like EasyWorship: clicking a song, verse, picture or background puts it in Preview;
 * Enter or double-click sends it Live. In the Live list, one click shows that slide.
 */
export interface SlideSet {
  title: string;
  slides: Slide[];
  index: number;
}

interface ShowState {
  preview: SlideSet | null;
  live: SlideSet | null;
  /** Put something in Preview (nothing changes on the big screen). */
  setPreview: (title: string, slides: Slide[], index?: number) => void;
  setPreviewIndex: (index: number) => void;
  /** Preview → Live (the chosen slide, or the one picked in Preview). */
  sendPreviewLive: (index?: number) => void;
  /** Show one of the slides in the Live list. */
  liveGo: (index: number) => void;
  /** Move through the Live list (arrow keys). */
  liveStep: (delta: 1 | -1) => void;
}

const isDesktop = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

function show(slide: Slide) {
  const p = useProjectionStore.getState();
  if (isDesktop() && !p.projectionOpen) p.openProjection();
  p.goLive(slide);
}

export const useShowStore = create<ShowState>()((set, get) => ({
  preview: null,
  live: null,
  setPreview: (title, slides, index = 0) => set({ preview: slides.length ? { title, slides, index: Math.max(0, Math.min(index, slides.length - 1)) } : null }),
  setPreviewIndex: (index) => set((s) => (s.preview ? { preview: { ...s.preview, index: Math.max(0, Math.min(index, s.preview.slides.length - 1)) } } : s)),
  sendPreviewLive: (index) => {
    const p = get().preview;
    if (!p) return;
    const i = index ?? p.index;
    set({ live: { ...p, index: i }, preview: { ...p, index: i } });
    show(p.slides[i]);
  },
  liveGo: (index) => {
    const l = get().live;
    if (!l || !l.slides[index]) return;
    set({ live: { ...l, index } });
    show(l.slides[index]);
  },
  liveStep: (delta) => {
    const l = get().live;
    if (!l) return;
    const i = l.index + delta;
    if (i >= 0 && i < l.slides.length) get().liveGo(i);
  },
}));

const LAST_BG = "whq-last-background";

/** The background last shown on the big screen (it comes back when the app opens). */
export function lastBackground(): NonNullable<Slide["background"]> | null {
  try { return JSON.parse(localStorage.getItem(LAST_BG) ?? "null"); } catch { return null; }
}

useProjectionStore.subscribe((state, prev) => {
  const slide = state.currentSlide;
  if (!slide || slide === prev.currentSlide || slide.media || slide.type === "logo") return;
  const bg = slide.background ?? (slide.style?.background ? { kind: slide.style.background.kind, value: slide.style.background.value } : null)
    ?? (() => { const st = useThemeStore.getState().themes[themeKindFor(slide.type)]; return st ? { kind: st.background.kind, value: st.background.value } : null; })();
  if (bg) { try { localStorage.setItem(LAST_BG, JSON.stringify(bg)); } catch { /* ignore */ } }
});

// Something went on screen another way (voice assistant, schedule, keyboard): keep the Live list in step.
useProjectionStore.subscribe((state, prev) => {
  if (state.currentSlide === prev.currentSlide || !state.currentSlide) return;
  const slide = state.currentSlide;
  const { live } = useShowStore.getState();
  const at = live?.slides.findIndex((s) => s === slide || (s.content.primaryText === slide.content.primaryText && s.label === slide.label)) ?? -1;
  if (live && at >= 0) {
    if (at !== live.index) useShowStore.setState({ live: { ...live, index: at } });
    return;
  }
  // Was it one of the schedule's items? Then the Live list shows that whole item.
  const item = state.serviceItems.find((it) => it.slides?.includes(slide));
  if (item?.slides) {
    useShowStore.setState({ live: { title: item.title, slides: item.slides, index: item.slides.indexOf(slide) } });
    return;
  }
  useShowStore.setState({ live: { title: slide.label ?? slide.content.secondaryText ?? "On screen", slides: [slide], index: 0 } });
});
