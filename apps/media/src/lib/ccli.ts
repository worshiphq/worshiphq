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

