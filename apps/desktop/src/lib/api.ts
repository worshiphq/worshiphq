declare global {
  interface Window {
    api: {
      query: (table: string, filters?: Record<string, any>) => Promise<any[]>;
      getById: (table: string, id: string) => Promise<any>;
      insert: (table: string, data: Record<string, any>) => Promise<any>;
      update: (table: string, id: string, data: Record<string, any>) => Promise<any>;
      delete: (table: string, id: string) => Promise<{ success: boolean }>;
      rawQuery: (sql: string, params?: any[]) => Promise<any>;
      login: (serverUrl: string, email: string, password: string) => Promise<{ success: boolean; user?: any; church?: any; error?: string }>;
      getSession: () => Promise<Session | null>;
      logout: () => Promise<{ success: boolean }>;
      syncNow: () => Promise<SyncStatus>;
      getSyncStatus: () => Promise<SyncStatus>;
      onSyncProgress: (cb: (progress: SyncProgress) => void) => () => void;
      winMinimize: () => void;
      winMaximize: () => void;
      winClose: () => void;
      winIsMaximized: () => Promise<boolean>;
      onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
      getVersion: () => Promise<string>;
      getDataPath: () => Promise<string>;
    };
  }
}

export interface Session {
  userId: string;
  churchId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  churchName: string;
  serverUrl: string;
  lastSyncAt: string | null;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  pendingChanges: number;
  syncing: boolean;
  error: string | null;
}

export interface SyncProgress {
  phase: "starting" | "pushing" | "pulling" | "done" | "error";
  progress: number;
  error?: string;
  count?: number;
}

const api = typeof window !== "undefined" && window.api ? window.api : null;

// Fallback for browser dev (no Electron)
function mock<T>(val: T): Promise<T> {
  return Promise.resolve(val);
}

export const db = {
  query: (table: string, filters?: Record<string, any>) =>
    api?.query(table, filters) ?? mock([]),
  getById: (table: string, id: string) =>
    api?.getById(table, id) ?? mock(null),
  insert: (table: string, data: Record<string, any>) =>
    api?.insert(table, data) ?? mock(data),
  update: (table: string, id: string, data: Record<string, any>) =>
    api?.update(table, id, data) ?? mock(data),
  delete: (table: string, id: string) =>
    api?.delete(table, id) ?? mock({ success: true }),
  rawQuery: (sql: string, params?: any[]) =>
    api?.rawQuery(sql, params) ?? mock([]),
};

export const auth = {
  login: (serverUrl: string, email: string, password: string) =>
    api?.login(serverUrl, email, password) ?? mock({ success: false, error: "Not in Electron" }),
  getSession: () => api?.getSession() ?? mock(null),
  logout: () => api?.logout() ?? mock({ success: true }),
};

export const sync = {
  now: () => api?.syncNow() ?? mock({ lastSyncAt: null, pendingChanges: 0, syncing: false, error: null }),
  status: () => api?.getSyncStatus() ?? mock({ lastSyncAt: null, pendingChanges: 0, syncing: false, error: null }),
  onProgress: (cb: (p: SyncProgress) => void) => api?.onSyncProgress(cb) ?? (() => {}),
};

export const appInfo = {
  version: () => api?.getVersion() ?? mock("0.1.0-dev"),
  dataPath: () => api?.getDataPath() ?? mock(""),
};
