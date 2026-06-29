import { create } from "zustand";
import type { Session, SyncStatus } from "../lib/api";

interface AppState {
  session: Session | null;
  syncStatus: SyncStatus;
  sidebarCollapsed: boolean;
  toast: { message: string; type: "success" | "error" | "info" } | null;

  setSession: (session: Session | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  toggleSidebar: () => void;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  syncStatus: { lastSyncAt: null, pendingChanges: 0, syncing: false, error: null },
  sidebarCollapsed: false,
  toast: null,

  setSession: (session) => set({ session }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  showToast: (message, type = "success") => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  clearToast: () => set({ toast: null }),
}));
