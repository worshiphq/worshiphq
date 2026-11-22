import { create } from "zustand";
import { mediaUrl } from "../lib/media-src";

/**
 * Plays audio tracks (backing tracks, sound clips, walk-in music) through this computer's sound output,
 * which is usually connected to the church sound desk. One track at a time.
 */
interface AudioState {
  trackId: string | null;
  name: string;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  loop: boolean;
  play: (track: { id: string; name: string; path: string }) => void;
  toggle: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  setLoop: (v: boolean) => void;
  /** Fade the music down and stop (for walk-in music before the service starts). */
  fadeOut: (ms?: number) => void;
}

let audio: HTMLAudioElement | null = null;
let fadeTimer: number | undefined;

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => useAudioStore.setState({ position: audio!.currentTime }));
    audio.addEventListener("loadedmetadata", () => useAudioStore.setState({ duration: audio!.duration || 0 }));
    audio.addEventListener("play", () => useAudioStore.setState({ playing: true }));
    audio.addEventListener("pause", () => useAudioStore.setState({ playing: false }));
    audio.addEventListener("ended", () => useAudioStore.setState({ playing: false, position: 0 }));
  }
  return audio;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  trackId: null,
  name: "",
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.9,
  loop: false,

  play: (track) => {
    const a = el();
    window.clearInterval(fadeTimer);
    if (get().trackId !== track.id) {
      a.src = mediaUrl(track.path);
      set({ trackId: track.id, name: track.name, position: 0, duration: 0 });
    }
    a.volume = get().volume;
    a.loop = get().loop;
    a.play().catch(() => set({ playing: false }));
  },
  toggle: () => {
    const a = el();
    if (!get().trackId) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  },
  stop: () => {
    const a = el();
    window.clearInterval(fadeTimer);
    a.pause();
    a.currentTime = 0;
    a.volume = get().volume;
    set({ playing: false, position: 0 });
  },
  seek: (seconds) => { const a = el(); a.currentTime = Math.max(0, seconds); },
  setVolume: (volume) => { el().volume = volume; set({ volume }); },
  setLoop: (loop) => { el().loop = loop; set({ loop }); },
  fadeOut: (ms = 3000) => {
    const a = el();
    if (a.paused) return;
    const start = a.volume;
    const steps = 30;
    let i = 0;
    window.clearInterval(fadeTimer);
    fadeTimer = window.setInterval(() => {
      i++;
      a.volume = Math.max(0, start * (1 - i / steps));
      if (i >= steps) { window.clearInterval(fadeTimer); get().stop(); }
    }, ms / steps);
  },
}));

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
