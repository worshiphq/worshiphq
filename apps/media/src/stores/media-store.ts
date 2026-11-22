import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isDesktopApp } from "../lib/media-src";

/** A PowerPoint or PDF turned into one picture per slide. */
export interface Presentation {
  id: string;
  name: string;
  slides: string[];
  addedAt: number;
}

export interface MediaItem {
  id: string;
  name: string;
  kind: "image" | "video" | "audio";
  /** Our own copy on this computer, or a temporary blob: URL in the browser preview. */
  path: string;
  size: number;
  addedAt: number;
  /** Browser preview only: gone after a reload. */
  temporary?: boolean;
}

interface MediaState {
  items: MediaItem[];
  presentations: Presentation[];
  importing: boolean;
  /** Choose a PowerPoint or PDF and turn it into slides. */
  importPresentation: () => Promise<Presentation | null>;
  removePresentation: (id: string) => Promise<void>;
  renamePresentation: (id: string, name: string) => void;
  error: string | null;
  /** Ask Windows for files, then copy them in. */
  pickFiles: () => Promise<MediaItem[]>;
  /** Copy files that were dropped onto the window (desktop: real paths). */
  importPaths: (paths: string[]) => Promise<MediaItem[]>;
  /** Browser preview: files from a file input or a drop. */
  importBrowserFiles: (files: File[]) => MediaItem[];
  rename: (id: string, name: string) => void;
  remove: (id: string) => Promise<void>;
  clearError: () => void;
}

const IMAGE = /\.(jpe?g|png|gif|webp|bmp)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|ogv)$/i;
const AUDIO = /\.(mp3|wav|m4a|aac|ogg|oga|flac|wma)$/i;

export const useMediaStore = create<MediaState>()(persist((set, get) => ({
  items: [],
  presentations: [],
  importing: false,

  importPresentation: async () => {
    if (!isDesktopApp()) { set({ error: "Importing PowerPoint and PDF works in the installed app." }); return null; }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, title: "Choose a PowerPoint or PDF", filters: [{ name: "PowerPoint or PDF", extensions: ["pptx", "ppt", "ppsx", "pps", "pdf"] }] });
    if (!picked) return null;
    const file = String(picked);
    set({ importing: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const slides = await invoke<string[]>("import_presentation", { path: file });
      const name = file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
      const p: Presentation = { id: crypto.randomUUID(), name, slides, addedAt: Date.now() };
      set((st) => ({ presentations: [p, ...st.presentations], importing: false }));
      return p;
    } catch (e) {
      set({ importing: false, error: String(e) });
      return null;
    }
  },

  removePresentation: async (id) => {
    const p = get().presentations.find((x) => x.id === id);
    set((st) => ({ presentations: st.presentations.filter((x) => x.id !== id) }));
    if (p && isDesktopApp()) {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const path of p.slides) await invoke("media_delete", { path }).catch(() => {});
    }
  },

  renamePresentation: (id, name) => set((st) => ({ presentations: st.presentations.map((x) => (x.id === id ? { ...x, name } : x)) })),
  error: null,

  pickFiles: async () => {
    if (!isDesktopApp()) return [];
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: true,
      title: "Choose pictures or videos",
      filters: [
        { name: "Pictures, videos and audio", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "mp4", "m4v", "webm", "mov", "ogv", "mp3", "wav", "m4a", "aac", "ogg", "flac", "wma"] },
      ],
    });
    if (!picked) return [];
    const paths = Array.isArray(picked) ? picked : [picked];
    return get().importPaths(paths.map(String));
  },

  importPaths: async (paths) => {
    const usable = paths.filter((p) => IMAGE.test(p) || VIDEO.test(p) || AUDIO.test(p));
    if (!usable.length) {
      set({ error: "Those files aren't pictures or videos WorshipHQ can show (try JPG, PNG, MP4 or WEBM)." });
      return [];
    }
    set({ importing: true, error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const files = await invoke<{ path: string; name: string; kind: "image" | "video" | "audio"; size: number }[]>("media_import", { paths: usable });
      const added: MediaItem[] = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, kind: f.kind, path: f.path, size: f.size, addedAt: Date.now() }));
      set((s) => ({ items: [...added, ...s.items], importing: false }));
      return added;
    } catch (e) {
      set({ importing: false, error: String(e) });
      return [];
    }
  },

  importBrowserFiles: (files) => {
    const added: MediaItem[] = files
      .filter((f) => IMAGE.test(f.name) || VIDEO.test(f.name) || AUDIO.test(f.name))
      .map((f) => ({
        id: crypto.randomUUID(),
        name: f.name.replace(/\.[^.]+$/, ""),
        kind: VIDEO.test(f.name) ? "video" : AUDIO.test(f.name) ? "audio" : "image",
        path: URL.createObjectURL(f),
        size: f.size,
        addedAt: Date.now(),
        temporary: true,
      }));
    if (!added.length) set({ error: "Those files aren't pictures or videos WorshipHQ can show (try JPG, PNG, MP4 or WEBM)." });
    set((s) => ({ items: [...added, ...s.items] }));
    return added;
  },

  rename: (id, name) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, name } : i)) })),

  remove: async (id) => {
    const item = get().items.find((i) => i.id === id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    if (!item) return;
    if (item.temporary) URL.revokeObjectURL(item.path);
    else if (isDesktopApp()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("media_delete", { path: item.path });
      } catch { /* file already gone */ }
    }
  },

  clearError: () => set({ error: null }),
}), {
  name: "whq-media-library",
  version: 1,
  partialize: (s) => ({ items: s.items.filter((i) => !i.temporary), presentations: s.presentations }),
}));
