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
  /** Playlist: tracks play one after another, each fading into the next. */
  playlist: Track[];
  crossfade: number;
  addToPlaylist: (t: Track) => void;
  removeFromPlaylist: (index: number) => void;
  clearPlaylist: () => void;
  playPlaylist: (from?: number) => void;
  nextTrack: () => void;
  setCrossfade: (seconds: number) => void;
}

export interface Track { id: string; name: string; path: string }

/** Index in the playlist of the track playing now (-1 = not playing from the playlist). */
let listAt = -1;
let crossing = false;

let audio: HTMLAudioElement | null = null;
let fadeTimer: number | undefined;

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    wire(audio);
  }
  return audio;
}

/** The listeners that keep the app's player state in step with one audio element. */
function wire(a: HTMLAudioElement) {
    a.addEventListener("timeupdate", () => { if (a !== audio) return;
      useAudioStore.setState({ position: a.currentTime });
      // Playlist: start fading into the next track a few seconds before this one ends.
      const st = useAudioStore.getState();
      const left = (a.duration || 0) - a.currentTime;
      if (listAt >= 0 && !crossing && !st.loop && a.duration && left <= st.crossfade && listAt + 1 < st.playlist.length) crossInto(listAt + 1);
    });
    a.addEventListener("loadedmetadata", () => a === audio && useAudioStore.setState({ duration: a.duration || 0 }));
    a.addEventListener("play", () => a === audio && useAudioStore.setState({ playing: true }));
    a.addEventListener("pause", () => a === audio && useAudioStore.setState({ playing: false }));
    a.addEventListener("ended", () => { if (a !== audio) return;
      useAudioStore.setState({ playing: false, position: 0 });
      const st = useAudioStore.getState();
      if (listAt >= 0 && !crossing && listAt + 1 < st.playlist.length) st.playPlaylist(listAt + 1);
      else if (listAt >= 0 && listAt + 1 >= st.playlist.length) listAt = -1;
    });
}

/** Fades the playing track out while the next one fades in, then the next one carries on as the main track. */
function crossInto(index: number) {
  const st = useAudioStore.getState();
  const next = st.playlist[index];
  if (!next || !audio) return;
  crossing = true;
  const old = audio;
  const fresh = new Audio(mediaUrl(next.path));
  fresh.volume = 0;
  fresh.play().catch(() => {});
  const steps = 30, ms = Math.max(500, st.crossfade * 1000);
  let i = 0;
  const startVol = old.volume;
  const t = window.setInterval(() => {
    i++;
    old.volume = Math.max(0, startVol * (1 - i / steps));
    fresh.volume = Math.min(st.volume, st.volume * (i / steps));
    if (i >= steps) {
      window.clearInterval(t);
      old.pause();
      // The new track carries on as the main one (no restart).
      wire(fresh);
      audio = fresh;
      fresh.volume = st.volume;
      listAt = index;
      useAudioStore.setState({ playing: true });
      crossing = false;
      useAudioStore.setState({ trackId: next.id, name: next.name, duration: fresh.duration || 0 });
    }
  }, ms / steps);
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
    listAt = -1;
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
  playlist: [],
  crossfade: 4,
  addToPlaylist: (t) => set((s) => ({ playlist: [...s.playlist, t] })),
  removeFromPlaylist: (index) => set((s) => ({ playlist: s.playlist.filter((_, i) => i !== index) })),
  clearPlaylist: () => { listAt = -1; set({ playlist: [] }); },
  setCrossfade: (crossfade) => set({ crossfade }),
  playPlaylist: (from = 0) => {
    const t = get().playlist[from];
    if (!t) return;
    listAt = from;
    get().play(t);
  },
  nextTrack: () => { if (listAt >= 0 && listAt + 1 < get().playlist.length) crossInto(listAt + 1); },
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
