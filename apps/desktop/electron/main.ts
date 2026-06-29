import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { initDatabase, getDatabase } from "./database";
import { registerSyncHandlers } from "./sync";
import { registerDataHandlers } from "./data-handlers";

let mainWindow: BrowserWindow | null = null;

const DIST = path.join(__dirname, "../dist");
const PRELOAD = path.join(__dirname, "preload.js");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "WorshipHQ",
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: "#0c0c10",
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST, "index.html"));
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath("userData"), "worshiphq.db");
  initDatabase(dbPath);

  registerDataHandlers();
  registerSyncHandlers();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
