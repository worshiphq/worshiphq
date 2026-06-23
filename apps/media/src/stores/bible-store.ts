import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { BibleVerse } from "../types";

export interface BiblePack {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  description: string;
  verse_count: number;
  file_size: number;
}

interface BibleState {
  packs: BiblePack[];
  activePack: string | null;
  loading: boolean;

  selectedBook: number | null;
  selectedChapter: number | null;
  chapterCount: number;
  verses: BibleVerse[];
  versesLoading: boolean;
  searchResults: BibleVerse[];
  searchQuery: string;

  loadPacks: () => Promise<void>;
  setActivePack: (id: string) => void;
  selectBook: (bookIndex: number | null) => void;
  selectChapter: (chapter: number | null) => void;
  loadChapter: (bookIndex: number, chapter: number) => Promise<void>;
  searchBible: (query: string) => Promise<void>;
  importPack: (sourcePath: string, packId: string) => Promise<void>;
  deletePack: (packId: string) => Promise<void>;
}

export const useBibleStore = create<BibleState>((set, get) => ({
  packs: [],
  activePack: null,
  loading: false,

  selectedBook: null,
  selectedChapter: null,
  chapterCount: 0,
  verses: [],
  versesLoading: false,
  searchResults: [],
  searchQuery: "",

  loadPacks: async () => {
    set({ loading: true });
    try {
      const packs = await invoke<BiblePack[]>("bible_list_packs");
      const activePack = get().activePack ?? packs[0]?.id ?? null;
      set({ packs, activePack, loading: false });
    } catch (e) {
      console.error("Failed to load Bible packs:", e);
      set({ loading: false });
    }
  },

  setActivePack: (id) => {
    set({ activePack: id, selectedBook: null, selectedChapter: null, verses: [], searchResults: [], searchQuery: "" });
  },

  selectBook: async (bookIndex) => {
    if (bookIndex === null) {
      set({ selectedBook: null, selectedChapter: null, chapterCount: 0, verses: [] });
      return;
    }
    const pack = get().activePack;
    if (!pack) return;

    try {
      const count = await invoke<number>("bible_chapter_count", { packId: pack, book: bookIndex + 1 });
      set({ selectedBook: bookIndex, selectedChapter: null, chapterCount: count, verses: [] });
    } catch {
      set({ selectedBook: bookIndex, selectedChapter: null, chapterCount: 0, verses: [] });
    }
  },

  selectChapter: (chapter) => {
    if (chapter === null) {
      set({ selectedChapter: null, verses: [] });
      return;
    }
    const { selectedBook } = get();
    if (selectedBook === null) return;
    set({ selectedChapter: chapter });
    get().loadChapter(selectedBook, chapter);
  },

  loadChapter: async (bookIndex, chapter) => {
    const pack = get().activePack;
    if (!pack) return;

    set({ versesLoading: true });
    try {
      const verses = await invoke<BibleVerse[]>("bible_get_chapter", {
        packId: pack,
        book: bookIndex + 1,
        chapter,
      });
      set({ verses, versesLoading: false });
    } catch (e) {
      console.error("Failed to load chapter:", e);
      set({ verses: [], versesLoading: false });
    }
  },

  searchBible: async (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    const pack = get().activePack;
    if (!pack) return;

    try {
      const results = await invoke<BibleVerse[]>("bible_search", { packId: pack, query });
      set({ searchResults: results });
    } catch (e) {
      console.error("Search failed:", e);
      set({ searchResults: [] });
    }
  },

  importPack: async (sourcePath, packId) => {
    try {
      await invoke("bible_import_pack", { sourcePath, packId });
      await get().loadPacks();
    } catch (e) {
      console.error("Import failed:", e);
      throw e;
    }
  },

  deletePack: async (packId) => {
    try {
      await invoke("bible_delete_pack", { packId });
      const { activePack } = get();
      if (activePack === packId) {
        set({ activePack: null, selectedBook: null, selectedChapter: null, verses: [] });
      }
      await get().loadPacks();
    } catch (e) {
      console.error("Delete failed:", e);
      throw e;
    }
  },
}));
