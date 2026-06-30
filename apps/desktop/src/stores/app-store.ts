import { create } from "zustand";
import type { Session, SyncStatus, SyncProgress } from "../lib/api";

interface SyncOverlayState {
  visible: boolean;
  phase: SyncProgress["phase"];
  progress: number;
  message: string;
  detail: string;
  pushed: number;
  pulled: number;
  skipped: number;
  error: string | null;
  tables: string[];
  currentTable: string;
}

interface AppState {
  session: Session | null;
  syncStatus: SyncStatus;
  syncOverlay: SyncOverlayState;
  sidebarCollapsed: boolean;
  toast: { message: string; type: "success" | "error" | "info" } | null;

  setSession: (session: Session | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  updateSyncOverlay: (update: Partial<SyncOverlayState>) => void;
  toggleSidebar: () => void;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;
}

const defaultOverlay: SyncOverlayState = {
  visible: false,
  phase: "starting",
  progress: 0,
  message: "",
  detail: "",
  pushed: 0,
  pulled: 0,
  skipped: 0,
  error: null,
  tables: [],
  currentTable: "",
};

export const useAppStore = create<AppState>((set) => ({
  session: null,
  syncStatus: { lastSyncAt: null, pendingChanges: 0, syncing: false, error: null },
  syncOverlay: { ...defaultOverlay },
  sidebarCollapsed: false,
  toast: null,

  setSession: (session) => set({ session }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  updateSyncOverlay: (update) => set((s) => ({ syncOverlay: { ...s.syncOverlay, ...update } })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  showToast: (message, type = "success") => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  clearToast: () => set({ toast: null }),
}));
