import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // ── Data operations ──
  query: (table: string, filters?: Record<string, any>) =>
    ipcRenderer.invoke("db:query", table, filters),
  getById: (table: string, id: string) =>
    ipcRenderer.invoke("db:getById", table, id),
  insert: (table: string, data: Record<string, any>) =>
    ipcRenderer.invoke("db:insert", table, data),
  update: (table: string, id: string, data: Record<string, any>) =>
    ipcRenderer.invoke("db:update", table, id, data),
  delete: (table: string, id: string) =>
    ipcRenderer.invoke("db:delete", table, id),
  rawQuery: (sql: string, params?: any[]) =>
    ipcRenderer.invoke("db:rawQuery", sql, params),

  // ── Auth ──
  login: (serverUrl: string, email: string, password: string) =>
    ipcRenderer.invoke("auth:login", serverUrl, email, password),
  getSession: () => ipcRenderer.invoke("auth:getSession"),
  logout: () => ipcRenderer.invoke("auth:logout"),

  // ── Sync ──
  syncNow: () => ipcRenderer.invoke("sync:now"),
  getSyncStatus: () => ipcRenderer.invoke("sync:status"),
  onSyncProgress: (cb: (progress: any) => void) => {
    const handler = (_e: any, progress: any) => cb(progress);
    ipcRenderer.on("sync:progress", handler);
    return () => ipcRenderer.removeListener("sync:progress", handler);
  },

  // ── Window controls ──
  winMinimize: () => ipcRenderer.send("win:minimize"),
  winMaximize: () => ipcRenderer.send("win:maximize"),
  winClose: () => ipcRenderer.send("win:close"),
  winIsMaximized: () => ipcRenderer.invoke("win:isMaximized"),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const handler = (_e: any, maximized: boolean) => cb(maximized);
    ipcRenderer.on("win:maximized", handler);
    return () => ipcRenderer.removeListener("win:maximized", handler);
  },

  // ── App info ──
  getVersion: () => ipcRenderer.invoke("app:version"),
  getDataPath: () => ipcRenderer.invoke("app:dataPath"),
});
