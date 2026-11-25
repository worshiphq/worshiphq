import { create } from "zustand";
import { serverHeaders } from "./account";
import { isDesktopApp } from "./media-src";

/**
 * Automatic updates. A few seconds after the app opens (and every 6 hours) it asks WorshipHQ for a newer version and
 * quietly downloads it. It never installs on its own while you might be in a service: a banner offers
 * "Restart and update" and you choose when.
 */

type Phase = "idle" | "checking" | "none" | "downloading" | "ready" | "installing" | "error";

interface UpdateState {
  phase: Phase;
  version: string | null;
  notes: string | null;
  progress: number; // 0–100 while downloading
  error: string | null;
  dismissed: boolean;
  checkedAt: number | null;
  check: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

// The downloaded update (kept outside the store, it is not plain data).
let pending: { install: () => Promise<void> } | null = null;
let running = false;

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  phase: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,
  dismissed: false,
  checkedAt: null,

  check: async (manual = false) => {
    if (!isDesktopApp() || running) return;
    if (get().phase === "ready") { if (manual) set({ dismissed: false }); return; }
    running = true;
    set({ phase: "checking", error: null, ...(manual ? { dismissed: false } : {}) });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      // Signed in: testers are offered test versions too.
      const headers = await serverHeaders().catch(() => null);
      const update = await check({ timeout: 30_000, ...(headers ? { headers } : {}) });
      set({ checkedAt: Date.now() });
      if (!update) { set({ phase: "none" }); return; }
      set({ phase: "downloading", version: update.version, notes: update.body ?? null, progress: 0 });
      let total = 0;
      let got = 0;
      await update.download((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total) set({ progress: Math.min(99, Math.round((got / total) * 100)) });
        } else if (e.event === "Finished") set({ progress: 100 });
      });
      pending = { install: () => update.install() };
      set({ phase: "ready", progress: 100 });
    } catch (e) {
      // Offline or WorshipHQ unreachable: say so only when the person asked.
      set({ phase: manual ? "error" : "idle", error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = false;
    }
  },

  install: async () => {
    if (!pending) return;
    set({ phase: "installing" });
    try {
      await pending.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

/** First check 20 seconds after opening, then every 6 hours. */
export function startUpdateChecks() {
  const first = window.setTimeout(() => useUpdateStore.getState().check(), 20_000);
  const every = window.setInterval(() => useUpdateStore.getState().check(), 6 * 60 * 60 * 1000);
  return () => { window.clearTimeout(first); window.clearInterval(every); };
}
