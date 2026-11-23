import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Extra layers on the projector, on top of the slides:
 *  - ticker: a thin band of words that keeps scrolling along the bottom
 *  - prop: something that stays on top of everything (a corner logo, or a lower-third title)
 *  - adjust: moving, scaling and keystone-correcting the whole picture for an awkward screen
 */
export interface Ticker {
  on: boolean;
  text: string;
  /** Seconds for the words to cross the screen once. */
  seconds: number;
  background: string;
  color: string;
}

export interface Prop {
  on: boolean;
  kind: "logo" | "lower-third";
  /** Logo: picture path; lower third: the two lines of text. */
  image?: string;
  title?: string;
  subtitle?: string;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Logo width as a share of the screen width (0.05–0.3). */
  size: number;
  opacity: number;
}

export interface Adjust {
  /** Percent of the screen, −20…20. */
  x: number;
  y: number;
  /** 0.7…1.2 */
  scale: number;
  /** Keystone, degrees, −15…15 (top narrower / wider). */
  keystone: number;
  /** Side tilt, degrees, −15…15. */
  tilt: number;
}

export const DEFAULT_TICKER: Ticker = { on: false, text: "", seconds: 18, background: "rgba(15,23,42,0.9)", color: "#ffffff" };
export const DEFAULT_PROP: Prop = { on: false, kind: "logo", corner: "top-right", size: 0.12, opacity: 0.9 };
export const DEFAULT_ADJUST: Adjust = { x: 0, y: 0, scale: 1, keystone: 0, tilt: 0 };

interface ExtrasState {
  ticker: Ticker;
  prop: Prop;
  adjust: Adjust;
  setTicker: (t: Partial<Ticker>) => void;
  setProp: (p: Partial<Prop>) => void;
  setAdjust: (a: Partial<Adjust>) => void;
  /** Send everything again (e.g. when the projector opens). */
  resend: () => void;
}

async function send(kind: "ticker" | "prop" | "adjust", value: unknown) {
  if (!(window as any).__TAURI_INTERNALS__) return;
  const { invoke } = await import("@tauri-apps/api/core");
  invoke("send_extra", { kind, json: JSON.stringify(value) }).catch(() => {});
}

export const useExtrasStore = create<ExtrasState>()(persist((set, get) => ({
  ticker: DEFAULT_TICKER,
  prop: DEFAULT_PROP,
  adjust: DEFAULT_ADJUST,
  setTicker: (t) => { const ticker = { ...get().ticker, ...t }; set({ ticker }); send("ticker", ticker); },
  setProp: (p) => { const prop = { ...get().prop, ...p }; set({ prop }); send("prop", prop); },
  setAdjust: (a) => { const adjust = { ...get().adjust, ...a }; set({ adjust }); send("adjust", adjust); },
  resend: () => { const s = get(); send("ticker", s.ticker); send("prop", s.prop); send("adjust", s.adjust); },
}), {
  name: "whq-media-extras",
  // The ticker and props start switched off each time; the screen tuning is kept.
  partialize: (s) => ({ adjust: s.adjust, prop: { ...s.prop, on: false }, ticker: { ...s.ticker, on: false } }),
}));
