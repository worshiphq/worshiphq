import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BibleVerse, Slide } from "../types";
import { formatReference, type ScriptureRef } from "../lib/scripture-ref";
import { fixImpossibleVerse, referenceFromHeard, referenceInSpeech } from "../lib/spoken-ref";
import { buildScriptureSlides } from "../lib/scripture-slides";
import { demoChapter } from "../lib/demo-bible";
import { isDesktopApp } from "../lib/media-src";
import { useBibleStore } from "./bible-store";
import { useProjectionStore } from "./projection-store";
import { startWhisperListening, stopWhisperListening } from "../lib/whisper-listener";

/** whisper = OpenAI Whisper on this computer (accurate); windows = the old Windows recogniser. */
export type VoiceEngine = "whisper" | "windows";

export type VoiceStatus = "off" | "starting" | "listening" | "error";
/** ask = show a banner with a button · auto = show it after a short countdown · list = only list it */
export type VoiceMode = "ask" | "auto" | "list";

export interface Detection {
  id: string;
  ref: ScriptureRef;
  label: string;
  said: string;
  confidence: number;
  at: number;
  status: "waiting" | "shown" | "dismissed" | "listed";
}

export interface HeardLine { id: string; text: string; at: number; isReference: boolean }

interface VoiceState {
  status: VoiceStatus;
  message: string | null;
  recognizer: string | null;
  level: number;
  partial: string;
  lines: HeardLine[];
  detections: Detection[];
  /** The detection the banner is asking about. */
  pending: Detection | null;
  /** Slides of the passage the assistant last put on screen (for Back / Next). */
  shown: { label: string; slides: Slide[]; index: number } | null;

  mode: VoiceMode;
  autoDelay: number;
  minConfidence: number;
  /** Also look up sentences in the Bible, to catch a verse being read without its reference. */
  matchQuotes: boolean;
  setMatchQuotes: (v: boolean) => void;
  engine: VoiceEngine;
  setEngine: (e: VoiceEngine) => void;
  /** Microphone for Whisper (a browser device id; "default" = Windows default). */
  micId: string;
  setMicId: (id: string) => void;
  whisperInstalled: boolean | null;
  installingWhisper: boolean;
  checkWhisper: () => Promise<void>;
  installWhisper: () => Promise<void>;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  handleEvent: (raw: string) => void;
  /** Same as hearing it: lets you try the assistant by typing. */
  tryText: (text: string) => void;
  showDetection: (id: string) => Promise<void>;
  dismiss: (id: string) => void;
  showPart: (index: number) => void;
  closeShown: () => void;
  setMode: (mode: VoiceMode) => void;
  setAutoDelay: (s: number) => void;
  setMinConfidence: (c: number) => void;
  clearHistory: () => void;
}

const MAX_LINES = 40;

/**
 * The preacher may read a verse without saying where it is. Look up a few words of what was heard in the
 * Bible; if they point to one place, suggest it.
 */
async function findQuotedVerse(text: string): Promise<ScriptureRef | null> {
  if (!isDesktopApp()) return null;
  const words = text.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 7) return null;
  const { activePack } = useBibleStore.getState();
  if (!activePack) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  // Try a couple of 5-word stretches from the sentence.
  const starts = [Math.floor((words.length - 5) / 2), 0, Math.max(0, words.length - 5)];
  for (const start of [...new Set(starts)]) {
    const phrase = words.slice(start, start + 5).join(" ");
    try {
      const hits = await invoke<BibleVerse[]>("bible_search", { packId: activePack, query: phrase });
      if (hits.length >= 1 && hits.length <= 3) {
        const h = hits[0];
        return { book: h.book - 1, chapter: h.chapter, verseStart: h.verse };
      }
    } catch { /* try the next stretch */ }
  }
  return null;
}

export const useVoiceStore = create<VoiceState>()(persist((set, get) => {
  function addLine(text: string, isReference: boolean) {
    set((s) => ({ lines: [{ id: crypto.randomUUID(), text, at: Date.now(), isReference }, ...s.lines].slice(0, MAX_LINES), partial: "" }));
  }

  function detect(ref: ScriptureRef, said: string, confidence: number) {
    const label = formatReference(ref);
    // Ignore the same reference heard again within 30 seconds.
    const recent = get().detections.find((d) => d.label === label && Date.now() - d.at < 30_000);
    if (recent) return;
    const mode = get().mode;
    const det: Detection = {
      id: crypto.randomUUID(), ref, label, said, confidence, at: Date.now(),
      status: mode === "list" ? "listed" : "waiting",
    };
    set((s) => ({ detections: [det, ...s.detections].slice(0, 60), pending: mode === "list" ? s.pending : det }));
  }

  return {
    status: "off",
    message: null,
    recognizer: null,
    level: 0,
    partial: "",
    lines: [],
    detections: [],
    pending: null,
    shown: null,

    mode: "ask",
    autoDelay: 3,
    minConfidence: 0.55,
    matchQuotes: true,
    setMatchQuotes: (matchQuotes) => set({ matchQuotes }),
    engine: "whisper",
    setEngine: (engine) => { const was = get().status; if (was === "listening" || was === "starting") get().stop(); set({ engine }); },
    micId: "default",
    setMicId: (micId) => set({ micId }),
    whisperInstalled: null,
    installingWhisper: false,
    checkWhisper: async () => {
      if (!isDesktopApp()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const st = await invoke<{ installed: boolean }>("whisper_status").catch(() => ({ installed: false }));
      set({ whisperInstalled: st.installed });
    },
    installWhisper: async () => {
      if (!isDesktopApp()) return;
      set({ installingWhisper: true, message: null });
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("whisper_install");
        set({ whisperInstalled: true, installingWhisper: false });
      } catch (e) {
        set({ installingWhisper: false, status: "error", message: String(e) });
      }
    },

    start: async () => {
      if (!isDesktopApp()) {
        set({ status: "error", message: "The microphone works in the installed desktop app. Here you can try it by typing below." });
        return;
      }
      set({ status: "starting", message: null });
      if (get().engine === "whisper") {
        if (get().whisperInstalled === null) await get().checkWhisper();
        if (!get().whisperInstalled) {
          set({ status: "error", message: "Whisper isn't downloaded yet. Go to Settings › Audio & microphone and press Download Whisper (one time, about 155 MB)." });
          return;
        }
        await startWhisperListening(get().micId, {
          onLevel: (level) => set({ level }),
          onSpeaking: (speaking) => set({ partial: speaking ? "…" : "" }),
          onText: (text) => get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.92, kind: "speech" })),
          onError: (message) => set({ status: "error", message }),
        });
        if (get().status === "starting") set({ status: "listening", recognizer: "Whisper (OpenAI) on this computer" });
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("voice_start");
      } catch (e) {
        set({ status: "error", message: String(e) });
      }
    },

    stop: async () => {
      await stopWhisperListening();
      if (isDesktopApp()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("voice_stop").catch(() => {});
      }
      set({ status: "off", level: 0, partial: "" });
    },

    handleEvent: (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw); } catch { return; }
      switch (msg.type) {
        case "ready":
          set({ status: "listening", recognizer: msg.recognizer ?? null, message: null });
          break;
        case "level":
          set({ level: Math.max(0, Math.min(100, Number(msg.level) || 0)) });
          break;
        case "partial":
          set({ partial: String(msg.text ?? "") });
          break;
        case "error":
          set({ status: "error", message: String(msg.message ?? "The voice assistant stopped."), level: 0 });
          break;
        case "stopped":
          if (get().status !== "error") set({ status: "off", level: 0, partial: "" });
          break;
        case "heard": {
          const text = String(msg.text ?? "");
          const confidence = Number(msg.confidence) || 0;
          let ref: ScriptureRef | null = null;
          if (msg.kind === "reference" && typeof msg.book === "number") ref = referenceFromHeard(text, msg.book);
          // Free speech: only trust a reference it clearly heard.
          if (!ref && confidence >= 0.3) ref = referenceInSpeech(text);
          addLine(text, !!ref);
          if (ref && confidence >= get().minConfidence * (msg.kind === "reference" ? 1 : 0.7)) detect(ref, text, confidence);
          else if (!ref && get().matchQuotes && confidence >= 0.4) findQuotedVerse(text).then((q) => { if (q) detect(q, text, confidence); });
          break;
        }
      }
    },

    tryText: (text) => {
      const t = text.trim();
      if (!t) return;
      const ref = referenceInSpeech(t);
      addLine(t, !!ref);
      if (ref) detect(ref, t, 1);
    },

    showDetection: async (id) => {
      const det = get().detections.find((d) => d.id === id);
      if (!det) return;
      const bible = useBibleStore.getState();
      if (!bible.packs.length) await bible.loadPacks();
      const { activePack, packs } = useBibleStore.getState();
      const pack = packs.find((p) => p.id === activePack);

      let chapter: BibleVerse[] = [];
      try {
        if (isDesktopApp()) {
          const { invoke } = await import("@tauri-apps/api/core");
          chapter = await invoke<BibleVerse[]>("bible_get_chapter", { packId: activePack, book: det.ref.book + 1, chapter: det.ref.chapter });
        } else {
          chapter = demoChapter(det.ref.book + 1, det.ref.chapter);
        }
      } catch { chapter = []; }
      if (!chapter.length) {
        set((s) => ({ pending: null, detections: s.detections.map((d) => (d.id === id ? { ...d, status: "dismissed" } : d)) }));
        return;
      }

      const ref = fixImpossibleVerse(det.ref, chapter[chapter.length - 1].verse);
      const start = ref.verseStart ?? 1;
      const end = ref.verseEnd ?? (ref.verseStart ? ref.verseStart : chapter[chapter.length - 1].verse);
      const verses = chapter.filter((v) => v.verse >= start && v.verse <= end);
      const label = formatReference({ ...ref, verseStart: start, verseEnd: end === start ? undefined : end });
      const slides = buildScriptureSlides(verses, label, pack?.abbreviation);
      if (!slides.length) return;

      const proj = useProjectionStore.getState();
      if (isDesktopApp() && !proj.projectionOpen) proj.openProjection();
      proj.goLive(slides[0]);
      set((s) => ({
        pending: s.pending?.id === id ? null : s.pending,
        shown: { label, slides, index: 0 },
        detections: s.detections.map((d) => (d.id === id ? { ...d, status: "shown", label } : d)),
      }));
    },

    dismiss: (id) =>
      set((s) => ({
        pending: s.pending?.id === id ? null : s.pending,
        detections: s.detections.map((d) => (d.id === id && d.status === "waiting" ? { ...d, status: "dismissed" } : d)),
      })),

    showPart: (index) => {
      const shown = get().shown;
      if (!shown || index < 0 || index >= shown.slides.length) return;
      useProjectionStore.getState().goLive(shown.slides[index]);
      set({ shown: { ...shown, index } });
    },

    closeShown: () => set({ shown: null }),
    setMode: (mode) => set({ mode }),
    setAutoDelay: (autoDelay) => set({ autoDelay }),
    setMinConfidence: (minConfidence) => set({ minConfidence }),
    clearHistory: () => set({ detections: [], lines: [], pending: null }),
  };
}, {
  name: "whq-media-voice",
  version: 1,
  partialize: (s) => ({ mode: s.mode, autoDelay: s.autoDelay, minConfidence: s.minConfidence, matchQuotes: s.matchQuotes, engine: s.engine, micId: s.micId }),
}));
