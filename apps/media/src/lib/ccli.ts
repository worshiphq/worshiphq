import { useSongStore } from "../stores/song-store";

/**
 * CCLI reporting: every song shown on the screen is noted once per day (title, writer, CCLI number), so the church
 * can fill in its CCLI copy report. The list never leaves this computer unless you save it.
 */
const KEY = "whq-ccli-log";

interface Use { date: string; songId: string; title: string; author: string; ccli: string }

function read(): Use[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Use[]; } catch { return []; }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Notes that a song was shown today (once per song per day). */
export function noteSongShown(songId: string) {
  const song = useSongStore.getState().songs.find((s) => s.id === songId);
  if (!song) return;
  const log = read();
  const date = today();
  if (log.some((u) => u.songId === songId && u.date === date)) return;
  log.push({ date, songId, title: song.title, author: song.author ?? "", ccli: song.ccli ?? "" });
  try { localStorage.setItem(KEY, JSON.stringify(log.slice(-5000))); } catch { /* ignore */ }
}

/** Saves a CSV of the songs used in the last `days` days (one row per song, with how many services used it). */
export async function saveCcliReport() {
  const answer = window.prompt("Report the songs used in the last how many days?", "90");
  if (!answer) return;
  const days = Math.max(1, Math.min(3650, parseInt(answer, 10) || 90));
  const since = new Date(Date.now() - days * 86_400_000);
  const from = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const used = read().filter((u) => u.date >= from);
  if (!used.length) { window.alert("No songs were shown on the screen in that time."); return; }
  const rows = new Map<string, { title: string; author: string; ccli: string; times: number; last: string }>();
  for (const u of used) {
    const song = useSongStore.getState().songs.find((s) => s.id === u.songId);
    const r = rows.get(u.songId) ?? { title: song?.title ?? u.title, author: song?.author ?? u.author, ccli: song?.ccli ?? u.ccli, times: 0, last: u.date };
    r.times++;
    if (u.date > r.last) r.last = u.date;
    rows.set(u.songId, r);
  }
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = ["Title,Written by,CCLI song number,Times used,Last used", ...[...rows.values()].sort((a, b) => b.times - a.times)
    .map((r) => [r.title, r.author, r.ccli, r.times, r.last].map(q).join(","))].join("\r\n");
  if (!(window as any).__TAURI_INTERNALS__) { console.log(csv); return; }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ title: "Save the CCLI song report", defaultPath: `CCLI songs used since ${from}.csv`, filters: [{ name: "Spreadsheet (CSV)", extensions: ["csv"] }] });
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_text_file", { path, text: "﻿" + csv }).catch((e) => window.alert(String(e)));
  const missing = [...rows.values()].filter((r) => !r.ccli).length;
  window.alert(`Saved ${rows.size} songs.${missing ? ` ${missing} have no CCLI number yet. Add it with Edit on the song.` : ""}`);
}
