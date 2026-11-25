import { ask, tell } from "../components/Dialogs";
import { serverHeaders } from "./account";
import { apiBase } from "../components/StockLibrary";
import { isDesktopApp } from "./media-src";

/**
 * Backup and restore: songs, schedules, looks, templates, profiles and settings (everything WorshipHQ Live keeps on
 * this computer). To a file you keep, or to WorshipHQ (a backup code brings it back on any computer).
 * Pictures and videos themselves are not in the backup (they can be very large); the list of them is.
 */
const SKIP = new Set(["whq-account", "whq-api-base", "whq-backup-code", "whq-backup-last"]);

export interface BackupFile {
  app: "WorshipHQ Live" | "WorshipHQ Media";
  kind: "backup";
  version: 1;
  made: string;
  computer?: string;
  data: Record<string, string>;
}

export function collectBackup(): BackupFile {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("whq-") && !SKIP.has(k)) data[k] = localStorage.getItem(k) ?? "";
  }
  return { app: "WorshipHQ Live", kind: "backup", version: 1, made: new Date().toISOString(), data };
}

/** Puts a backup back and restarts the app's screens so everything loads from it. */
export function restoreBackup(file: BackupFile) {
  if ((file?.app !== "WorshipHQ Live" && file?.app !== "WorshipHQ Media") || file.kind !== "backup" || typeof file.data !== "object") throw new Error("That isn't a WorshipHQ Live backup.");
  for (const [k, v] of Object.entries(file.data)) {
    if (k.startsWith("whq-") && !SKIP.has(k)) localStorage.setItem(k, v);
  }
  window.location.reload();
}

export function summary(file: BackupFile): string {
  const count = (key: string, path: (o: any) => unknown[] | undefined) => {
    try { return path(JSON.parse(file.data[key] ?? "{}"))?.length ?? 0; } catch { return 0; }
  };
  const songs = count("whq-media-songs", (o) => o?.state?.songs);
  const items = count("whq-media-service", (o) => o?.state?.serviceItems);
  const media = count("whq-media-library", (o) => o?.state?.items);
  return `${songs} songs, ${items} items in the schedule, ${media} pictures/videos listed`;
}

export async function saveBackupFile() {
  const file = collectBackup();
  if (!isDesktopApp()) { console.log(file); return; }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const d = new Date();
  const name = `WorshipHQ Live backup ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.whqbackup`;
  const path = await save({ title: "Save a backup", defaultPath: name, filters: [{ name: "WorshipHQ Live backup", extensions: ["whqbackup"] }] });
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_text_file", { path, text: JSON.stringify(file) });
  await tell(`Backup saved: ${summary(file)}.\n\nKeep it on a USB stick or in Google Drive. Restore it from File › Restore from a backup.`);
}

export async function openBackupFile() {
  if (!isDesktopApp()) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ title: "Restore from a backup", multiple: false, filters: [{ name: "WorshipHQ Live backup", extensions: ["whqbackup", "json"] }] });
  if (!picked) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const [f] = await invoke<{ text: string }[]>("read_text_files", { paths: [String(picked)] });
  const file = JSON.parse(f.text) as BackupFile;
  if (!(await ask(`Restore this backup from ${new Date(file.made).toLocaleString()}?\n\n${summary(file)}\n\nWhat is on this computer now will be replaced.`, "Restore", { danger: true }))) return;
  restoreBackup(file);
}

/* ───────────── WorshipHQ cloud backup ───────────── */

const licence = serverHeaders;

/** This church's backup code (made once; the same code restores on any computer). */
export function backupCode(): string {
  let code = localStorage.getItem("whq-backup-code");
  if (!code) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const r = crypto.getRandomValues(new Uint8Array(12));
    code = Array.from(r, (b) => abc[b % abc.length]).join("").replace(/(.{4})(?!$)/g, "$1-");
    localStorage.setItem("whq-backup-code", code);
  }
  return code;
}

export function lastCloudBackup(): string | null {
  return localStorage.getItem("whq-backup-last");
}

export async function cloudBackup(): Promise<string> {
  const lic = await licence();
  if (!lic) throw new Error("Sign in to your WorshipHQ account (Help › WorshipHQ account) to use cloud backup.");
  const res = await fetch(`${apiBase()}/api/media/backup?code=${encodeURIComponent(backupCode())}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...lic },
    body: JSON.stringify(collectBackup()),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `WorshipHQ didn't answer (${res.status}).`);
  const at = new Date().toISOString();
  localStorage.setItem("whq-backup-last", at);
  return at;
}

export async function cloudRestore(code: string) {
  const lic = await licence();
  if (!lic) throw new Error("Sign in to your WorshipHQ account (Help › WorshipHQ account) to use cloud backup.");
  const clean = code.trim().toUpperCase();
  const res = await fetch(`${apiBase()}/api/media/backup?code=${encodeURIComponent(clean)}`, { headers: lic });
  if (!res.ok) throw new Error(res.status === 404 ? "No backup found for that code." : `WorshipHQ didn't answer (${res.status}).`);
  const file = (await res.json()) as BackupFile;
  if (!(await ask(`Restore the backup from ${new Date(file.made).toLocaleString()}?\n\n${summary(file)}\n\nWhat is on this computer now will be replaced.`, "Restore", { danger: true }))) return;
  localStorage.setItem("whq-backup-code", clean);
  restoreBackup(file);
}
