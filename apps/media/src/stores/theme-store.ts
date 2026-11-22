import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_THEMES, DEFAULT_TRANSITION, type SlideBackground, type SlideStyle, type ThemeKind, type Transition } from "../lib/themes";

interface ThemeState {
  themes: Record<ThemeKind, SlideStyle>;
  transition: Transition;
  setTransition: (t: Partial<Transition>) => void;
  update: (kind: ThemeKind, changes: Partial<SlideStyle>) => void;
  updateBackground: (kind: ThemeKind, changes: Partial<SlideBackground>) => void;
  updateSub: (kind: ThemeKind, changes: Partial<SlideStyle["sub"]>) => void;
  /** Copy one kind's look to the others. */
  copyTo: (from: ThemeKind, to: ThemeKind[]) => void;
  reset: (kind: ThemeKind) => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const useThemeStore = create<ThemeState>()(persist((set) => ({
  themes: clone(DEFAULT_THEMES),
  transition: { ...DEFAULT_TRANSITION },
  setTransition: (t) => set((st) => ({ transition: { ...st.transition, ...t } })),
  update: (kind, changes) => set((s) => ({ themes: { ...s.themes, [kind]: { ...s.themes[kind], ...changes } } })),
  updateBackground: (kind, changes) =>
    set((s) => ({ themes: { ...s.themes, [kind]: { ...s.themes[kind], background: { ...s.themes[kind].background, ...changes } } } })),
  updateSub: (kind, changes) =>
    set((s) => ({ themes: { ...s.themes, [kind]: { ...s.themes[kind], sub: { ...s.themes[kind].sub, ...changes } } } })),
  copyTo: (from, to) =>
    set((s) => {
      const themes = { ...s.themes };
      for (const k of to) themes[k] = { ...clone(s.themes[from]), sub: { ...s.themes[k].sub } };
      return { themes };
    }),
  reset: (kind) => set((s) => ({ themes: { ...s.themes, [kind]: clone(DEFAULT_THEMES[kind]) } })),
}), {
  name: "whq-media-looks",
  version: 1,
  // New settings added later get their default values.
  merge: (persisted, current) => {
    const p = (persisted as Partial<ThemeState>)?.themes ?? {};
    const themes = { ...current.themes };
    for (const k of Object.keys(themes) as ThemeKind[]) {
      const saved = (p as Record<string, Partial<SlideStyle>>)[k];
      if (saved) themes[k] = { ...themes[k], ...saved, background: { ...themes[k].background, ...saved.background }, sub: { ...themes[k].sub, ...saved.sub } };
    }
    const transition = { ...DEFAULT_TRANSITION, ...((persisted as Partial<ThemeState>)?.transition ?? {}) };
    return { ...current, themes, transition };
  },
}));
