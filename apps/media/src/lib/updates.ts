import { create } from "zustand";
import { serverHeaders } from "./account";
import { isDesktopApp } from "./media-src";

/**
 * Updates. How they are handled is the person's choice (Settings › About):
 *  - "auto":   looks by itself, downloads quietly, then asks to restart.
 *  - "ask":    looks by itself and says a new version is there; the person presses Download.
 *  - "manual": never looks by itself; only when Check for updates is pressed.
 * A downloaded update is never installed until Restart and update is pressed (never in the middle of a service).
 */

export type UpdateMode = "auto" | "ask" | "manual";
type Phase = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "installing" | "error";

const MODE_KEY = "whq-update-mode";
export function updateMode(): UpdateMode {
  try { const v = localStorage.getItem(MODE_KEY); if (v === "auto" || v === "ask" || v === "manual") return v; } catch { /* ignore */ }
  return "ask";
}

interface UpdateState {
  phase: Phase;
  version: string | null;
  notes: string | null;
  progress: number; // 0–100 while downloading
  error: string | null;
  dismissed: boolean;
  checkedAt: number | null;
  mode: UpdateMode;
  setMode: (m: UpdateMode) => void;
  check: (manual?: boolean) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

// The update that was found, and the downloaded one (kept outside the store, they are not plain data).
type Found = { version: string; body?: string; download: (on: (e: { event: string; data: { contentLength?: number; chunkLength: number } }) => void) => Promise<void>; install: () => Promise<void> };
let found: Found | null = null;
let downloaded = false;
let running = false;

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  phase: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,
  dismissed: false,
  checkedAt: null,
  mode: updateMode(),

  setMode: (mode) => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
    set({ mode });
    // Switching to automatic takes what is waiting.
    if (mode === "auto" && get().phase === "available") get().download();
  },

  check: async (manual = false) => {
    if (!isDesktopApp() || running) return;
    const now = get().phase;
    if (now === "ready" || now === "downloading" || now === "installing") { if (manual) set({ dismissed: false }); return; }
    running = true;
    set({ phase: "checking", error: null, ...(manual ? { dismissed: false } : {}) });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      // Signed in: testers are offered test versions too.
      const headers = await serverHeaders().catch(() => null);
      const update = await check({ timeout: 30_000, ...(headers ? { headers } : {}) });
      set({ checkedAt: Date.now() });
      if (!update) { found = null; downloaded = false; set({ phase: "none" }); return; }
      if (found?.version !== update.version) downloaded = false;
      found = update as unknown as Found;
      set({ phase: "available", version: update.version, notes: update.body ?? null, progress: 0, ...(manual || get().version !== update.version ? { dismissed: false } : {}) });
    } catch (e) {
      // Offline or WorshipHQ unreachable: say so only when the person asked.
      set({ phase: manual ? "error" : "idle", error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = false;
    }
    if (get().mode === "auto" && get().phase === "available") await get().download();
  },

  download: async () => {
    if (!found || get().phase === "downloading") return;
    if (downloaded) { set({ phase: "ready", progress: 100 }); return; }
    set({ phase: "downloading", progress: 0, error: null, dismissed: false });
    try {
      let total = 0, got = 0;
      await found.download((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total) set({ progress: Math.min(99, Math.round((got / total) * 100)) });
        } else if (e.event === "Finished") set({ progress: 100 });
      });
      downloaded = true;
      set({ phase: "ready", progress: 100 });
    } catch (e) {
      // Back to "a new version is there", so Download can be pressed again.
      set({ phase: "available", error: e instanceof Error ? e.message : String(e) });
    }
  },

  install: async () => {
    if (!found || !downloaded) return;
    set({ phase: "installing" });
    try {
      await found.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

/** First look 20 seconds after opening, then every 6 hours: only if the person hasn't chosen "manual". */
export function startUpdateChecks() {
  const look = () => { if (useUpdateStore.getState().mode !== "manual") useUpdateStore.getState().check(); };
  const first = window.setTimeout(look, 20_000);
  const every = window.setInterval(look, 6 * 60 * 60 * 1000);
  return () => { window.clearTimeout(first); window.clearInterval(every); };
}
