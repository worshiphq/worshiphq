import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Slide, SlideElement } from "../types";

/** Slides you design yourself (announcements, sermon titles, giving details), in sets ("decks"). */
export interface Deck {
  id: string;
  title: string;
  slides: Slide[];
  updatedAt: number;
}

export function blankSlide(): Slide {
  return {
    type: "announcement",
    label: "Slide",
    content: { primaryText: "" },
    template: { background: "#000", textLayout: "center" },
    elements: [newElement("text", { text: "Your title here", size: 110, bold: true, y: 360, h: 220 })],
  };
}

export function newElement(kind: SlideElement["kind"], over: Partial<SlideElement> = {}): SlideElement {
  const base: SlideElement =
    kind === "text" ? { id: crypto.randomUUID(), kind, x: 160, y: 420, w: 1600, h: 240, text: "New text", size: 72, color: "#ffffff", align: "center", bold: false }
    : kind === "image" ? { id: crypto.randomUUID(), kind, x: 660, y: 290, w: 600, h: 500, fit: "contain" }
    : { id: crypto.randomUUID(), kind, x: 0, y: 760, w: 1920, h: 220, fill: "rgba(13,148,136,0.85)", radius: 0 };
  return { ...base, ...over };
}

interface DeckState {
  decks: Deck[];
  addDeck: (title?: string) => Deck;
  saveDeck: (deck: Deck) => void;
  deleteDeck: (id: string) => void;
}

export const useDeckStore = create<DeckState>()(persist((set, get) => ({
  decks: [],
  addDeck: (title = "New slides") => {
    const deck: Deck = { id: crypto.randomUUID(), title, slides: [blankSlide()], updatedAt: Date.now() };
    set({ decks: [deck, ...get().decks] });
    return deck;
  },
  saveDeck: (deck) => set({ decks: get().decks.map((d) => (d.id === deck.id ? { ...deck, updatedAt: Date.now() } : d)) }),
  deleteDeck: (id) => set({ decks: get().decks.filter((d) => d.id !== id) }),
}), { name: "whq-media-decks" }));
