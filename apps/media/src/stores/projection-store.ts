import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Slide, ServiceItem, DisplayInfo, AlertMessage } from "../types";
import { useThemeStore } from "./theme-store";
import { themeKindFor } from "../lib/themes";

/** The slide as it should look right now: its words plus the current Look & fonts setting for its kind. */
function withLook(slide: Slide): Slide {
  const { themes, transition } = useThemeStore.getState();
  if (slide.media) return { ...slide, transition };
  const style = themes[themeKindFor(slide.type)];
  return { ...slide, style: slide.background ? { ...style, background: { ...style.background, ...slide.background } } : style, transition };
}

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
  /** Ctrl+C: words hidden, background still showing. */
  textCleared: boolean;
  /** What was on screen before the logo, so pressing Logo again brings it back. */
  beforeLogo: Slide | null;
  alert: AlertMessage | null;
  stageOpen: boolean;
  stageMessage: string;
  /** Countdown shown on the stage display (ms since 1970), if any. */
  stageTimerTo: number | null;
  isFrozen: boolean;
  projectionOpen: boolean;

  serviceItems: ServiceItem[];
  activeItemIndex: number;

  /** Plan details shown on the Service plan screen. */
  /** Picture shown by the Logo button (a path from Pictures & videos). */
  logo: { src: string; kind: "image" | "video" } | null;
  setLogo: (logo: { src: string; kind: "image" | "video" } | null) => void;
  /** Called when the projector window was closed outside the app's buttons. */
  markProjectionClosed: () => void;

  serviceName: string;
  serviceDate: string;   // yyyy-mm-dd
  startTime: string;     // HH:mm, 24-hour

  displays: DisplayInfo[];
  projectionDisplay: number | null;
  stageDisplay: number | null;

  isLicensed: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  hwid: string;

  goLive: (slide: Slide) => void;
  /** Re-send what is on screen, e.g. after Look & fonts changed. */
  refreshLive: () => void;
  goBlack: () => void;
  goLogo: () => void;
  goClear: () => void;
  /** Black again = back to what was showing. */
  toggleBlack: () => void;
  /** Logo again = back to what was showing. */
  toggleLogo: () => void;
  /** Ctrl+C: hide / show the words, keep the background. */
  toggleClearText: () => void;
  sendAlert: (alert: AlertMessage | null) => void;
  openStage: (monitorIndex?: number) => void;
  closeStage: () => void;
  markStageClosed: () => void;
  setStageMessage: (text: string) => void;
  setStageTimer: (to: number | null) => void;
  freeze: () => void;
  setNextSlide: (slide: Slide | null) => void;

  openProjection: (monitorIndex?: number) => void;
  closeProjection: () => void;

  addToService: (item: ServiceItem) => void;
  removeFromService: (index: number) => void;
  reorderService: (from: number, to: number) => void;
  setActiveItem: (index: number) => void;
  updateServiceItem: (index: number, changes: Partial<ServiceItem>) => void;
  setServiceDetails: (details: Partial<{ serviceName: string; serviceDate: string; startTime: string }>) => void;
  /** Empties the plan for a fresh service (keeps whatever is on screen). */
  newService: () => void;

  setDisplays: (displays: DisplayInfo[]) => void;
  setProjectionDisplay: (id: number | null) => void;
  setStageDisplay: (id: number | null) => void;

  setLicense: (status: { isLicensed: boolean; isTrial: boolean; trialDaysRemaining: number; hwid: string }) => void;
}

export const useProjectionStore = create<ProjectionState>()(persist((set) => ({
  currentSlide: null,
  nextSlide: null,
  isLive: false,
  isBlack: false,
  textCleared: false,
  beforeLogo: null,
  alert: null,
  stageOpen: false,
  stageMessage: "",
  stageTimerTo: null,
  isFrozen: false,
  projectionOpen: false,

  serviceItems: [],
  activeItemIndex: -1,

  logo: null,
  setLogo: (logo) => set({ logo }),
  markProjectionClosed: () => set({ projectionOpen: false }),

  serviceName: "Sunday Service",
  serviceDate: nextSunday(),
  startTime: "09:00",

  displays: [],
  projectionDisplay: null,
  stageDisplay: null,

  isLicensed: false,
  isTrial: true,
  trialDaysRemaining: 14,
  hwid: "",

  goLive: (slide) => {
    set({ currentSlide: slide, isLive: true, isBlack: false, textCleared: false });
    tauriInvoke("go_live", { slideJson: JSON.stringify(withLook(slide)) }).catch(() => {});
  },

  refreshLive: () => {
    const { currentSlide, isLive, textCleared } = useProjectionStore.getState();
    if (currentSlide && isLive) tauriInvoke("go_live", { slideJson: JSON.stringify({ ...withLook(currentSlide), hideText: textCleared }) }).catch(() => {});
  },

  goBlack: () => {
    set({ isBlack: true });
    tauriInvoke("go_black").catch(() => {});
  },

  goLogo: () => {
    const logo = useProjectionStore.getState().logo;
    const logoSlide: Slide = {
      type: "logo",
      label: "Church logo",
      content: { primaryText: "" },
      template: { background: "#000", textLayout: "center" },
      media: logo ? { kind: logo.kind, src: logo.src, fit: "contain", loop: true, muted: true } : undefined,
    };
    set({ currentSlide: logoSlide, isLive: true, isBlack: false });
    tauriInvoke("go_live", { slideJson: JSON.stringify(withLook(logoSlide)) }).catch(() => {});
  },

  toggleBlack: () => {
    const { isBlack, currentSlide, isLive } = useProjectionStore.getState();
    if (!isBlack) { useProjectionStore.getState().goBlack(); return; }
    set({ isBlack: false });
    if (currentSlide && isLive) tauriInvoke("go_live", { slideJson: JSON.stringify(withLook(currentSlide)) }).catch(() => {});
    else tauriInvoke("go_clear").catch(() => {});
  },

  toggleLogo: () => {
    const { currentSlide, beforeLogo } = useProjectionStore.getState();
    if (currentSlide?.type === "logo") {
      if (beforeLogo) useProjectionStore.getState().goLive(beforeLogo);
      else useProjectionStore.getState().goClear();
      set({ beforeLogo: null });
      return;
    }
    set({ beforeLogo: currentSlide });
    useProjectionStore.getState().goLogo();
  },

  toggleClearText: () => {
    const { currentSlide, isLive, textCleared } = useProjectionStore.getState();
    if (!currentSlide || !isLive) return;
    const next = !textCleared;
    set({ textCleared: next });
    tauriInvoke("go_live", { slideJson: JSON.stringify({ ...withLook(currentSlide), hideText: next }) }).catch(() => {});
  },

  sendAlert: (alert) => {
    set({ alert });
    tauriInvoke("send_alert", { alertJson: JSON.stringify(alert ?? { text: "" }) }).catch(() => {});
  },

  openStage: (monitorIndex) => {
    const chosen = monitorIndex ?? useProjectionStore.getState().stageDisplay ?? null;
    tauriInvoke("open_stage_window", { monitorIndex: chosen })
      .then(() => set({ stageOpen: true }))
      .catch(() => {});
  },
  closeStage: () => {
    tauriInvoke("close_stage_window").then(() => set({ stageOpen: false })).catch(() => {});
  },
  markStageClosed: () => set({ stageOpen: false }),
  setStageMessage: (stageMessage) => set({ stageMessage }),
  setStageTimer: (stageTimerTo) => set({ stageTimerTo }),

  goClear: () => {
    set({ currentSlide: null, isLive: false, isBlack: false, textCleared: false });
    tauriInvoke("go_clear").catch(() => {});
  },

  freeze: () =>
    set((state) => ({ isFrozen: !state.isFrozen })),

  setNextSlide: (slide) =>
    set({ nextSlide: slide }),

  openProjection: (monitorIndex) => {
    const chosen = monitorIndex ?? useProjectionStore.getState().projectionDisplay ?? null;
    tauriInvoke("open_projection_window", { monitorIndex: chosen })
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
      // The first thing added becomes the selected item, so its slides show straight away.
      activeItemIndex: state.activeItemIndex === -1 ? state.serviceItems.length : state.activeItemIndex,
    })),

  removeFromService: (index) =>
    set((state) => {
      const serviceItems = state.serviceItems.filter((_, i) => i !== index);
      let activeItemIndex = state.activeItemIndex;
      if (index < activeItemIndex) activeItemIndex -= 1;
      else if (index === activeItemIndex) activeItemIndex = Math.min(index, serviceItems.length - 1);
      return { serviceItems, activeItemIndex };
    }),

  reorderService: (from, to) =>
    set((state) => {
      if (to < 0 || to >= state.serviceItems.length) return {};
      const items = [...state.serviceItems];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      // Keep the same item selected after it (or a neighbour) moves.
      const activeId = state.serviceItems[state.activeItemIndex]?.id;
      return {
        serviceItems: items.map((item, i) => ({ ...item, order: i })),
        activeItemIndex: activeId ? items.findIndex((i) => i.id === activeId) : state.activeItemIndex,
      };
    }),

  setActiveItem: (index) =>
    set({ activeItemIndex: index }),

  updateServiceItem: (index, changes) =>
    set((state) => ({
      serviceItems: state.serviceItems.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    })),

  setServiceDetails: (details) => set(details),

  newService: () =>
    set({ serviceItems: [], activeItemIndex: -1, serviceName: "Sunday Service", serviceDate: nextSunday(), startTime: "09:00" }),

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
}), {
  // The service plan is saved on this computer, so it is still there after closing the app.
  name: "whq-media-service",
  version: 1,
  partialize: (s) => ({
    serviceItems: s.serviceItems,
    activeItemIndex: s.activeItemIndex,
    serviceName: s.serviceName,
    serviceDate: s.serviceDate,
    startTime: s.startTime,
    projectionDisplay: s.projectionDisplay,
    stageDisplay: s.stageDisplay,
    logo: s.logo,
  }),
}));

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

