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
import { COMMAND_GROUP, describeCommand, parseVoiceCommand, type CommandGroup, type VoiceCommand } from "../lib/voice-commands";
import { showPassage, stepPart, stepVerse, usePassageStore, setSecondVersion } from "../lib/show-passage";
import { findPack } from "../lib/version-match";

/** whisper = OpenAI Whisper on this computer (accurate); windows = the old Windows recogniser. */
export type VoiceEngine = "whisper" | "windows";

/** Whisper speech models: bigger ones hear better but need a faster computer. */
export type WhisperModel = "tiny" | "base" | "small" | "turbo";
export const WHISPER_MODELS: { id: WhisperModel; label: string; size: string; note: string }[] = [
  { id: "tiny", label: "Fastest", size: "78 MB", note: "Answers almost at once, even on older computers. Best for spoken commands." },
  { id: "base", label: "Standard", size: "148 MB", note: "Quick, and better at full sentences and accents." },
  { id: "small", label: "Accurate", size: "488 MB", note: "Hears accents and busy rooms much better. Needs a fairly recent computer." },
  { id: "turbo", label: "Best", size: "574 MB", note: "The most accurate (OpenAI's large Whisper, turbo). Needs a fast computer." },
];

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

export interface HeardLine {
  id: string; text: string; at: number; isReference: boolean;
  /** A voice command it acted on (or why it couldn't). */
  command?: string;
  commandOk?: boolean;
}

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
  /** Models downloaded on this computer. */
  whisperModels: WhisperModel[];
  whisperModel: WhisperModel;
  setWhisperModel: (m: WhisperModel) => void;
  /** Start listening as soon as WorshipHQ Media opens. */
  autoStart: boolean;
  setAutoStart: (v: boolean) => void;
  installingWhisper: boolean;
  /** While downloading: bytes so far and in total, and which part. */
  whisperProgress: { stage: string; done: number; total: number } | null;
  checkWhisper: () => Promise<void>;
  installWhisper: (model?: WhisperModel) => Promise<void>;
  /** Spoken commands ("next verse", "verse 5", "clear the screen"). */
  commandsOn: boolean;
  setCommandsOn: (v: boolean) => void;
  commandGroups: Record<CommandGroup, boolean>;
  setCommandGroup: (g: CommandGroup, on: boolean) => void;
  /** When set, a command must start with this word ("Media, next verse"). */
  wakeWord: string;
  setWakeWord: (w: string) => void;
  runCommand: (c: VoiceCommand) => Promise<{ ok: boolean; note: string }>;

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

/** A command already acted on from an early guess, so the finished sentence doesn't run it again. */
let earlyDone: { key: string; at: number } | null = null;
const commandKey = (c: VoiceCommand) => JSON.stringify(c);

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
    whisperModels: [],
    whisperModel: "base",
    setWhisperModel: (whisperModel) => {
      set({ whisperModel, whisperInstalled: get().whisperModels.includes(whisperModel) });
      const st = get().status;
      if (st === "listening" || st === "starting") get().stop().then(() => { if (get().whisperModels.includes(whisperModel)) get().start(); });
    },
    autoStart: false,
    setAutoStart: (autoStart) => set({ autoStart }),
    installingWhisper: false,
    whisperProgress: null,
    commandsOn: true,
    setCommandsOn: (commandsOn) => set({ commandsOn }),
    commandGroups: { bible: true, slides: true, screen: true, banner: true },
    setCommandGroup: (g, on) => set((s) => ({ commandGroups: { ...s.commandGroups, [g]: on } })),
    wakeWord: "",
    setWakeWord: (wakeWord) => set({ wakeWord: wakeWord.slice(0, 30) }),
    runCommand: async (c) => {
      const proj = useProjectionStore.getState();
      const passage = usePassageStore.getState().passage;
      const needPassage = { ok: false, note: "Show a Bible verse first" };
      switch (c.type) {
        case "verse": {
          if (!passage) return needPassage;
          const label = await stepVerse(c.delta);
          return label ? { ok: true, note: label } : { ok: false, note: "No more verses that way" };
        }
        case "gotoVerse": {
          if (!passage) return needPassage;
          const label = await showPassage({ book: passage.book, chapter: passage.chapter, verseStart: c.start, verseEnd: c.end });
          return label ? { ok: true, note: label } : { ok: false, note: "That verse isn't in this chapter" };
        }
        case "chapter": {
          if (!passage) return needPassage;
          const label = await showPassage({ book: passage.book, chapter: c.chapter, verseStart: c.start ?? 1, verseEnd: c.end });
          return label ? { ok: true, note: label } : { ok: false, note: "That chapter isn't in this book" };
        }
        case "chapterDelta": {
          if (!passage) return needPassage;
          const label = await showPassage({ book: passage.book, chapter: passage.chapter + c.delta, verseStart: 1 });
          return label ? { ok: true, note: label } : { ok: false, note: "No more chapters that way" };
        }
        case "slide": {
          if (stepPart(c.delta)) return { ok: true, note: "Moved" };
          // Songs and service items: the same as pressing the arrow keys on the Live page.
          window.dispatchEvent(new KeyboardEvent("keydown", { key: c.delta > 0 ? "ArrowRight" : "ArrowLeft" }));
          return { ok: true, note: "Moved" };
        }
        case "clear":
          if (!proj.textCleared) proj.toggleClearText();
          return { ok: true, note: "Words cleared (say “show it” to bring them back)" };
        case "black":
          if (!proj.isBlack) proj.toggleBlack();
          return { ok: true, note: "Screen is black (say “show it” to bring it back)" };
        case "show": {
          const pending = get().pending;
          if (pending) { await get().showDetection(pending.id); return { ok: true, note: pending.label }; }
          if (proj.isBlack) { proj.toggleBlack(); return { ok: true, note: "Screen back on" }; }
          if (proj.textCleared) { proj.toggleClearText(); return { ok: true, note: "Words back on" }; }
          return { ok: false, note: "Nothing waiting to show" };
        }
        case "version": {
          const bible = useBibleStore.getState();
          if (!bible.packs.length) await bible.loadPacks();
          const packs = useBibleStore.getState().packs;
          const pack = findPack(c.query, packs);
          if (!pack) return { ok: false, note: `No Bible called “${c.query}” on this computer` };
          if (c.second) setSecondVersion(pack.id === useBibleStore.getState().activePack ? "" : pack.id);
          else useBibleStore.getState().setActivePack(pack.id);
          const again = passage ? await showPassage({ book: passage.book, chapter: passage.chapter, verseStart: passage.start, verseEnd: passage.end }) : null;
          const what = c.second ? `${pack.abbreviation} underneath` : `Now in ${pack.abbreviation}`;
          return { ok: true, note: again ? `${what} · ${again}` : what };
        }
        case "secondOff": {
          setSecondVersion("");
          const again = passage ? await showPassage({ book: passage.book, chapter: passage.chapter, verseStart: passage.start, verseEnd: passage.end }) : null;
          return { ok: true, note: again ? `One version · ${again}` : "One version" };
        }
        case "cancel": {
          const pending = get().pending;
          if (!pending) return { ok: false, note: "Nothing to cancel" };
          get().dismiss(pending.id);
          return { ok: true, note: "Cancelled" };
        }
      }
    },
    checkWhisper: async () => {
      if (!isDesktopApp()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const st = await invoke<{ installed: boolean; models: WhisperModel[] }>("whisper_status").catch(() => ({ installed: false, models: [] as WhisperModel[] }));
      const models = st.models ?? [];
      // The chosen model isn't here but another is: use that one.
      if (st.installed && !models.includes(get().whisperModel) && models.length) set({ whisperModel: models[models.length - 1] });
      set({ whisperModels: models, whisperInstalled: st.installed && models.includes(get().whisperModel) });
    },
    installWhisper: async (model) => {
      if (!isDesktopApp()) return;
      const m = model ?? get().whisperModel;
      set({ installingWhisper: true, message: null, whisperProgress: { stage: "model", done: 0, total: 1 } });
      const { invoke } = await import("@tauri-apps/api/core");
      const timer = setInterval(() => {
        invoke<{ stage: string; done: number; total: number }>("whisper_progress", { model: m }).then((p) => { if (get().installingWhisper) set({ whisperProgress: p }); }).catch(() => {});
      }, 400);
      try {
        await invoke("whisper_install", { model: m });
        set({ installingWhisper: false, whisperProgress: null, whisperModel: m });
        await get().checkWhisper();
      } catch (e) {
        set({ installingWhisper: false, whisperProgress: null, status: "error", message: String(e) });
      } finally {
        clearInterval(timer);
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
        // Load the speech model once and keep it in memory (much faster than loading it for every sentence).
        set({ recognizer: "Loading the speech model…" });
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("whisper_start", { model: get().whisperModel }).catch(() => { /* falls back to the slower way */ });
        if (get().status !== "starting") return;
        await startWhisperListening(get().micId, {
          onLevel: (level) => set({ level }),
          onSpeaking: (speaking) => set({ partial: speaking ? "…" : "" }),
          onEarly: (text) => {
            set({ partial: text });
            const st = get();
            if (!st.commandsOn) return;
            const cmd = parseVoiceCommand(text, st.wakeWord || undefined);
            // Single words ("next", "back") could still become "next chapter": wait for those.
            if (!cmd || text.trim().split(/\s+/).length < 2 || !st.commandGroups[COMMAND_GROUP[cmd.type]]) return;
            if (cmd.type === "version" && !findPack(cmd.query, useBibleStore.getState().packs)) return;
            const key = commandKey(cmd);
            if (earlyDone && earlyDone.key === key && Date.now() - earlyDone.at < 4000) return;
            earlyDone = { key, at: Date.now() };
            get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.9, kind: "speech", early: true }));
          },
          onText: (text) => get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.92, kind: "speech" })),
          onError: (message) => set({ status: "error", message }),
        }, get().whisperModel);
        if (get().status === "starting") set({ status: "listening", recognizer: `Whisper ${WHISPER_MODELS.find((x) => x.id === get().whisperModel)?.label ?? ""} (OpenAI) on this computer` });
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
        await invoke("whisper_stop").catch(() => {});
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
          const st = get();
          let cmd = st.commandsOn ? parseVoiceCommand(text, st.wakeWord || undefined) : null;
          if (cmd?.type === "version" && !findPack(cmd.query, useBibleStore.getState().packs)) cmd = null;
          if (cmd) {
            // Already done from the early guess while it was being said.
            if (!msg.early && earlyDone && earlyDone.key === commandKey(cmd) && Date.now() - earlyDone.at < 5000) {
              earlyDone = null;
              break;
            }
            const id = crypto.randomUUID();
            const allowed = st.commandGroups[COMMAND_GROUP[cmd.type]];
            const name = describeCommand(cmd);
            set((s) => ({ lines: [{ id, text, at: Date.now(), isReference: false, command: allowed ? name : name + " (switched off in Settings)", commandOk: allowed }, ...s.lines].slice(0, MAX_LINES), partial: "" }));
            if (allowed) {
              get().runCommand(cmd).then((r) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, command: name + " → " + r.note, commandOk: r.ok } : l)) })));
            }
            break;
          }
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
      const typedCmd = get().commandsOn ? parseVoiceCommand(t, get().wakeWord || undefined) : null;
      if (typedCmd && (typedCmd.type !== "version" || findPack(typedCmd.query, useBibleStore.getState().packs))) {
        get().handleEvent(JSON.stringify({ type: "heard", text: t, confidence: 1, kind: "speech" }));
        return;
      }
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
      void pack;
      const label = await showPassage(ref);
      const passage = usePassageStore.getState().passage;
      if (!label || !passage) return;
      set((s) => ({
        pending: s.pending?.id === id ? null : s.pending,
        shown: { label, slides: passage.slides, index: 0 },
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
  partialize: (s) => ({ mode: s.mode, autoDelay: s.autoDelay, minConfidence: s.minConfidence, matchQuotes: s.matchQuotes, engine: s.engine, micId: s.micId, commandsOn: s.commandsOn, commandGroups: s.commandGroups, wakeWord: s.wakeWord, whisperModel: s.whisperModel, autoStart: s.autoStart }),
  merge: (persisted, current) => ({
    ...current,
    ...(persisted as object),
    commandGroups: { ...current.commandGroups, ...((persisted as { commandGroups?: object } | undefined)?.commandGroups ?? {}) },
  }),
}));
