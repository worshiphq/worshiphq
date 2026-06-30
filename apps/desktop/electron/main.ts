import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from "electron";
import path from "path";
import fs from "fs";
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
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: "#f4f4f7",
  });

  Menu.setApplicationMenu(null);

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

  // Window control IPC
  ipcMain.on("win:minimize", () => mainWindow?.minimize());
  ipcMain.on("win:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
  ipcMain.handle("win:isMaximized", () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle("shell:openExternal", (_e, url: string) => shell.openExternal(url));

  ipcMain.handle("dialog:pickImage", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Choose a profile photo",
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "jpeg" : ext;
    const buf = fs.readFileSync(filePath);
    if (buf.length > 1_200_000) return { error: "Image too large. Please use an image under 1 MB." };
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  });

  createWindow();

  mainWindow?.on("maximize", () => mainWindow?.webContents.send("win:maximized", true));
  mainWindow?.on("unmaximize", () => mainWindow?.webContents.send("win:maximized", false));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
