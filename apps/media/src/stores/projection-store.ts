import { create } from "zustand";
import type { Slide, ServiceItem, DisplayInfo } from "../types";

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

interface ProjectionState {
  currentSlide: Slide | null;
  nextSlide: Slide | null;
  isLive: boolean;
  isBlack: boolean;
  isFrozen: boolean;
  projectionOpen: boolean;

  serviceItems: ServiceItem[];
  activeItemIndex: number;

  displays: DisplayInfo[];
  projectionDisplay: number | null;
  stageDisplay: number | null;

  isLicensed: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  hwid: string;

  goLive: (slide: Slide) => void;
  goBlack: () => void;
  goLogo: () => void;
  goClear: () => void;
  freeze: () => void;
  setNextSlide: (slide: Slide | null) => void;

  openProjection: (monitorIndex?: number) => void;
  closeProjection: () => void;

  addToService: (item: ServiceItem) => void;
  removeFromService: (index: number) => void;
  reorderService: (from: number, to: number) => void;
  setActiveItem: (index: number) => void;

  setDisplays: (displays: DisplayInfo[]) => void;
  setProjectionDisplay: (id: number | null) => void;
  setStageDisplay: (id: number | null) => void;

  setLicense: (status: { isLicensed: boolean; isTrial: boolean; trialDaysRemaining: number; hwid: string }) => void;
}

export const useProjectionStore = create<ProjectionState>((set) => ({
  currentSlide: null,
  nextSlide: null,
  isLive: false,
  isBlack: false,
  isFrozen: false,
  projectionOpen: false,

  serviceItems: [],
  activeItemIndex: -1,

  displays: [],
  projectionDisplay: null,
  stageDisplay: null,

  isLicensed: false,
  isTrial: true,
  trialDaysRemaining: 14,
  hwid: "",

  goLive: (slide) => {
    set({ currentSlide: slide, isLive: true, isBlack: false });
    tauriInvoke("go_live", { slideJson: JSON.stringify(slide) }).catch(() => {});
  },

  goBlack: () => {
    set({ isBlack: true });
    tauriInvoke("go_black").catch(() => {});
  },

  goLogo: () => {
    const logoSlide: Slide = {
      type: "logo",
      content: { primaryText: "" },
      template: { background: "#000", textLayout: "center" },
    };
    set({ currentSlide: logoSlide, isLive: true, isBlack: false });
    tauriInvoke("go_live", { slideJson: JSON.stringify(logoSlide) }).catch(() => {});
  },

  goClear: () => {
    set({ currentSlide: null, isLive: false, isBlack: false });
    tauriInvoke("go_clear").catch(() => {});
  },

  freeze: () =>
    set((state) => ({ isFrozen: !state.isFrozen })),

  setNextSlide: (slide) =>
    set({ nextSlide: slide }),

  openProjection: (monitorIndex) => {
    tauriInvoke("open_projection_window", { monitorIndex: monitorIndex ?? null })
      .then(() => set({ projectionOpen: true }))
      .catch(() => {});
  },

  closeProjection: () => {
    tauriInvoke("close_projection_window")
      .then(() => set({ projectionOpen: false }))
      .catch(() => {});
  },

  addToService: (item) =>
    set((state) => ({
      serviceItems: [...state.serviceItems, { ...item, order: state.serviceItems.length }],
    })),

  removeFromService: (index) =>
    set((state) => ({
      serviceItems: state.serviceItems.filter((_, i) => i !== index),
    })),

  reorderService: (from, to) =>
    set((state) => {
      const items = [...state.serviceItems];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { serviceItems: items.map((item, i) => ({ ...item, order: i })) };
    }),

  setActiveItem: (index) =>
    set({ activeItemIndex: index }),

  setDisplays: (displays) =>
    set({ displays }),

  setProjectionDisplay: (id) =>
    set({ projectionDisplay: id }),

  setStageDisplay: (id) =>
    set({ stageDisplay: id }),

  setLicense: (status) =>
    set({
      isLicensed: status.isLicensed,
      isTrial: status.isTrial,
      trialDaysRemaining: status.trialDaysRemaining,
      hwid: status.hwid,
    }),
}));
