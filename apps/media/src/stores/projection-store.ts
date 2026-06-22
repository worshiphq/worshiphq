import { create } from "zustand";
import type { Slide, ServiceItem, DisplayInfo } from "../types";

interface ProjectionState {
  // Projection
  currentSlide: Slide | null;
  nextSlide: Slide | null;
  isLive: boolean;
  isBlack: boolean;
  isFrozen: boolean;

  // Service
  serviceItems: ServiceItem[];
  activeItemIndex: number;

  // Display
  displays: DisplayInfo[];
  projectionDisplay: number | null;
  stageDisplay: number | null;

  // License
  isLicensed: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  hwid: string;

  // Actions - Projection
  goLive: (slide: Slide) => void;
  goBlack: () => void;
  goLogo: () => void;
  goClear: () => void;
  freeze: () => void;
  setNextSlide: (slide: Slide | null) => void;

  // Actions - Service
  addToService: (item: ServiceItem) => void;
  removeFromService: (index: number) => void;
  reorderService: (from: number, to: number) => void;
  setActiveItem: (index: number) => void;

  // Actions - Display
  setDisplays: (displays: DisplayInfo[]) => void;
  setProjectionDisplay: (id: number | null) => void;
  setStageDisplay: (id: number | null) => void;

  // Actions - License
  setLicense: (status: { isLicensed: boolean; isTrial: boolean; trialDaysRemaining: number; hwid: string }) => void;
}

export const useProjectionStore = create<ProjectionState>((set) => ({
  currentSlide: null,
  nextSlide: null,
  isLive: false,
  isBlack: false,
  isFrozen: false,

  serviceItems: [],
  activeItemIndex: -1,

  displays: [],
  projectionDisplay: null,
  stageDisplay: null,

  isLicensed: false,
  isTrial: true,
  trialDaysRemaining: 14,
  hwid: "",

  goLive: (slide) =>
    set({ currentSlide: slide, isLive: true, isBlack: false }),

  goBlack: () =>
    set({ isBlack: true }),

  goLogo: () =>
    set({
      currentSlide: {
        type: "logo",
        content: { primaryText: "" },
        template: { background: "#000", textLayout: "center" },
      },
      isLive: true,
      isBlack: false,
    }),

  goClear: () =>
    set({ currentSlide: null, isLive: false, isBlack: false }),

  freeze: () =>
    set((state) => ({ isFrozen: !state.isFrozen })),

  setNextSlide: (slide) =>
    set({ nextSlide: slide }),

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
