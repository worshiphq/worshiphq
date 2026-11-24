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
import { useSongStore } from "./song-store";
import { useShowStore } from "./show-store";
import { buildSongSlides } from "../lib/song-slides";
import { plainText } from "../lib/rich-text";
import { startWhisperListening, stopWhisperListening } from "../lib/whisper-listener";
import { COMMAND_GROUP, describeCommand, parseVoiceCommand, type CommandGroup, type VoiceCommand } from "../lib/voice-commands";
import { showPassage, stepPart, stepVerse, usePassageStore, setSecondVersion } from "../lib/show-passage";
import { findPack, versionAsked } from "../lib/version-match";
import { understand, type AiAction } from "../lib/ai";
import { wordsToNumbers } from "../lib/spoken-ref";
import { parseReference } from "../lib/scripture-ref";
import { settledReference } from "../lib/live-words";
import type { VoiceCommand as Cmd } from "../lib/voice-commands";

/** whisper = OpenAI Whisper on this computer (accurate); windows = the old Windows recogniser. */
export type VoiceEngine = "whisper" | "windows" | "twi";

/** Whisper speech models: bigger ones hear better but need a faster computer. */
export type WhisperModel = "tiny" | "base" | "small" | "turbo" | "twi";
export const WHISPER_MODELS: { id: WhisperModel; label: string; size: string; note: string }[] = [
  { id: "tiny", label: "Fastest", size: "78 MB", note: "Answers almost at once, even on older computers. Best for spoken commands." },
  { id: "base", label: "Standard", size: "148 MB", note: "Quick, and better at full sentences and accents." },
  { id: "small", label: "Accurate", size: "488 MB", note: "Hears accents and busy rooms much better. Needs a fairly recent computer." },
  { id: "twi", label: "Twi / Akan", size: "175 MB", note: "For preaching in Twi (and Twi mixed with English). Free and offline. WorshipHQ AI works out what was meant." },
  { id: "turbo", label: "Best", size: "574 MB", note: "The most accurate (OpenAI's large Whisper, turbo). Needs a fast computer." },
];

export type VoiceStatus = "off" | "starting" | "listening" | "error";
/** ask = show a banner with a button · auto = show it after a short countdown · list = only list it */
export type VoiceMode = "ask" | "auto" | "list";

export interface Detection {
  id: string;
  /** A song line heard (instead of a Bible reference). */
  song?: { id: string; slide: number };
  ref: ScriptureRef;
  /** The Bible version asked for with it ("the King James version of Mark 2:10"). */
  packId?: string;
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
  /** The words of "partial" it is sure of. */
  partialSure: string;
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
  /** Recognise songs being sung: offer the song, and follow along when it is already on screen. */
  matchSongs: boolean;
  setMatchSongs: (v: boolean) => void;
  /** WorshipHQ AI: understands requests in any wording and finds verses that are quoted or paraphrased. */
  aiOn: boolean;
  setAiOn: (v: boolean) => void;
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
  /** Start listening as soon as WorshipHQ Live opens. */
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

/**
 * Free check on this computer before asking the AI (which costs money per sentence): is it a request to the media
 * team, or does it sound like scripture? Ordinary preaching never leaves the computer.
 */
const REQUEST = /\b(give me|can i have|could i have|do you have|let'?s|let us|read|turn|go to|go back|move on|show|put|switch|change|version|verse|verses|chapter|scripture|bible|king james|kjv|niv|nkjv|esv|amplified|message|living|good news|twi|asante|akuapem|next|previous|before that|after that|not that|that'?s not|wrong one|other one|i said|i want|i asked|go on|continue|clear|black|screen|media|projector|kenkan|nkyekyɛmu|ti\b)/i;
const SCRIPTURE = /\b(god|lord|jesus|christ|spirit|holy|faith|grace|love|sin|heaven|kingdom|father|prayer|pray|blessed|righteous|salvation|saved|believe|believeth|shepherd|cross|blood|word|written|says|saith|said|psalm|psalmist|apostle|paul|peter|david|moses|abraham|prophet|onyame|nyankopɔn|awurade|yesu|kristo|honhom|ɔsoro|nhyira|bɔne|gyidi|ɔdɔ)\b/i;
function worthAsking(text: string): boolean {
  if (REQUEST.test(text)) return true;
  // Sounds like scripture (two or more Bible words in a fairly long sentence).
  const hits = text.match(new RegExp(SCRIPTURE.source, "gi"))?.length ?? 0;
  return hits >= 2 && text.split(/\s+/).length >= 6;
}

/** The last few sentences heard (the AI uses them to understand the next one). */
const recent: string[] = [];

/** Does the verse share enough words with what was said? (Guards against a wrong AI guess.) */
async function verseMatches(ref: ScriptureRef, said: string): Promise<boolean> {
  if (!isDesktopApp()) return true;
  const { activePack } = useBibleStore.getState();
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const chapter = await invoke<BibleVerse[]>("bible_get_chapter", { packId: activePack, book: ref.book + 1, chapter: ref.chapter });
    const start = ref.verseStart ?? 1, end = ref.verseEnd ?? start;
    const text = chapter.filter((v) => v.verse >= start && v.verse <= end).map((v) => v.text).join(" ");
    const stop = new Set("the and that for his her him unto with they them this shall was are you your have not but all who which from thou thee thy our out into upon will has had were been then there their what when also said let may its".split(" "));
    const ws = (t: string) => new Set(t.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).map((w) => w.replace(/(eth|est|ing|ed|s)$/, "")));
    const v = ws(text), h = ws(said);
    if (!v.size) return false;
    let hits = 0;
    for (const w of h) if (v.has(w)) hits++;
    return hits >= 2 && hits / Math.min(v.size, h.size || 1) >= 0.25;
  } catch {
    return false;
  }
}

/* ── Songs being sung ── */
const words = (t: string) => plainText(t).toLowerCase().replace(/[^a-zɛɔ0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length > 1);
let songIndex: { songs: unknown; lines: { id: string; title: string; slide: number; words: Set<string>; n: number }[] } | null = null;

/** Finds the song (and the slide) a heard sentence comes from, if it clearly matches one line of lyrics. */
function findSongLine(text: string): { id: string; title: string; slide: number } | null {
  const heard = words(text);
  if (heard.length < 4) return null;
  const songs = useSongStore.getState().songs;
  if (!songIndex || songIndex.songs !== songs) {
    const lines: NonNullable<typeof songIndex>["lines"] = [];
    for (const song of songs) {
      buildSongSlides(song).forEach((sl, i) => {
        // Two neighbouring lines together, so a sentence that runs over a line break still matches.
        const ls = plainText(sl.content.primaryText).split("\n").filter((l) => l.trim());
        for (let k = 0; k < ls.length; k++) {
          const w = words(ls[k] + " " + (ls[k + 1] ?? ""));
          if (w.length >= 3) lines.push({ id: song.id, title: song.title, slide: i, words: new Set(w), n: w.length });
        }
      });
    }
    songIndex = { songs, lines };
  }
  let best: { id: string; title: string; slide: number; score: number } | null = null;
  for (const l of songIndex.lines) {
    let hits = 0;
    for (const w of heard) if (l.words.has(w)) hits++;
    const score = hits / heard.length;
    if (hits >= 4 && score >= 0.75 && (!best || score > best.score)) best = { id: l.id, title: l.title, slide: l.slide, score };
  }
  return best;
}

/** A command already acted on from an early guess, so the finished sentence doesn't run it again. */
let earlyDone: { key: string; at: number; id: string } | null = null;
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
  /** Adds a heard line, or puts the better reading in place of the quick one. */
  function addLine(text: string, isReference: boolean, id: string, refine: boolean) {
    set((s) => {
      if (s.lines.some((l) => l.id === id)) return { lines: s.lines.map((l) => (l.id === id ? { ...l, text, isReference: l.isReference || isReference } : l)) };
      const lines = [{ id, text, at: Date.now(), isReference }, ...s.lines].slice(0, MAX_LINES);
      return refine ? { lines } : { lines, partial: "", partialSure: "" };
    });
  }

  function detect(ref: ScriptureRef, said: string, confidence: number, source?: "AI", pack?: { id: string; abbreviation: string } | null) {
    const label = formatReference(ref) + (pack ? ` · ${pack.abbreviation}` : "") + (source ? " · AI" : "");
    const now = usePassageStore.getState().passage;
    const onScreen = !!now && now.book === ref.book && now.chapter === ref.chapter && now.start === (ref.verseStart ?? 1);
    // Ignore the same reference heard again within 30 seconds, unless it was shown and the screen has moved on since.
    const recent = get().detections.find((d) => d.label === label && Date.now() - d.at < 30_000);
    if (recent && !(recent.status === "shown" && !onScreen && Date.now() - recent.at > 6000)) return;
    // Same verse, now with the version that was asked for.
    const waiting = get().pending;
    if (pack && waiting && !waiting.song && waiting.status === "waiting" && !waiting.packId && formatReference(waiting.ref) === formatReference(ref)) {
      const full = { ...waiting, packId: pack.id, label, said };
      set((s) => ({ pending: full, detections: s.detections.map((d) => (d.id === waiting.id ? full : d)) }));
      return;
    }
    // "Romans 8" … "verse 28": the same suggestion, now complete.
    const open = get().pending;
    if (open && !open.song && !source && open.status === "waiting" && open.ref.book === ref.book && open.ref.chapter === ref.chapter && !open.ref.verseStart && ref.verseStart && Date.now() - open.at < 15_000) {
      const full = { ...open, ref, label, said, packId: pack?.id ?? open.packId };
      set((s) => ({ pending: full, detections: s.detections.map((d) => (d.id === open.id ? full : d)) }));
      return;
    }
    const mode = get().mode;
    const det: Detection = {
      id: crypto.randomUUID(), ref, packId: pack?.id, label, said, confidence, at: Date.now(),
      status: mode === "list" ? "listed" : "waiting",
    };
    set((s) => ({ detections: [det, ...s.detections].slice(0, 60), pending: mode === "list" ? s.pending : det }));
  }

  /**
   * While a sentence is still being said: verses named, songs being sung and verses being read out, from the words
   * it is sure of. (The AI waits for the whole sentence: it costs money.)
   */
  const askedPack = (text: string) => { const q = versionAsked(text); return q ? findPack(q, useBibleStore.getState().packs) : null; };
  let lastQuote: { label: string; words: number } | null = null;
  let quoteBusy = false;
  function followLive(sure: string) {
    const st = get();
    const ws = sure.split(/\s+/).filter(Boolean);
    if (ws.length < 3) { lastQuote = null; return; }
    const named = settledReference(sure);
    if (named) { detect(named.ref, sure, 0.9, undefined, askedPack(sure)); return; }
    if (st.matchSongs && ws.length >= 5) {
      const tail = ws.slice(-9).join(" ");
      const hit = findSongLine(tail);
      if (hit) { heardSong(hit, tail, 0.9); return; }
    }
    // A verse read out without its reference: both of two looks, a few words apart, must point to the same place.
    if (st.matchQuotes && ws.length >= 8 && !quoteBusy && (!lastQuote || ws.length < lastQuote.words || ws.length - lastQuote.words >= 3)) {
      quoteBusy = true;
      const tail = ws.slice(-12).join(" ");
      findQuotedVerse(tail).then((q) => {
        const label = q ? formatReference(q) : "";
        if (q && lastQuote?.label === label) detect(q, tail, 0.85);
        lastQuote = { label, words: ws.length };
      }).finally(() => { quoteBusy = false; });
    }
  }

  /** A line of a song was heard: follow along when it is on screen, or suggest it. */
  function heardSong(hit: { id: string; title: string; slide: number }, said: string, confidence: number): "followed" | "suggested" {
    const live = useShowStore.getState().live;
    if (live && live.title === hit.title) {
      if (live.index !== hit.slide) useShowStore.getState().liveGo(hit.slide);
      return "followed";
    }
    const label = `Song: ${hit.title}`;
    if (!get().detections.some((d) => d.label === label && Date.now() - d.at < 60_000)) {
      const mode = get().mode;
      const det: Detection = { id: crypto.randomUUID(), song: { id: hit.id, slide: hit.slide }, ref: { book: 0, chapter: 1 }, label, said, confidence, at: Date.now(), status: mode === "list" ? "listed" : "waiting" };
      set((s) => ({ detections: [det, ...s.detections].slice(0, 60), pending: mode === "list" ? s.pending : det }));
    }
    return "suggested";
  }

  /** Puts a note next to the last heard line (what the AI did). */
  function noteLast(note: string, ok: boolean) {
    set((s) => ({ lines: s.lines.map((l, i) => (i === 0 ? { ...l, command: l.command ? `${l.command} · ${note}` : note, commandOk: ok } : l)) }));
  }

  /** Asks WorshipHQ AI about one sentence. Returns false when the AI could not be reached. */
  async function askAi(said: string, confidence: number): Promise<boolean> {
    const bible = useBibleStore.getState();
    const passage = usePassageStore.getState().passage;
    let second = "";
    try { second = localStorage.getItem("whq-second-version") ?? ""; } catch { /* ignore */ }
    const actions = await understand(said, {
      before: recent.slice(-3).filter((x) => x !== said),
      screen: { passage: passage?.label, showing: useShowStore.getState().live?.title, secondVersion: second || undefined },
      versions: bible.packs.map((p) => ({ id: p.id, abbreviation: p.abbreviation, name: p.name, language: p.language })),
    }).catch(() => null);
    if (actions === null) return false;
    // "The King James version of Mark 2:10": one thing to show, not a version change and then a verse.
    const wanted = actions.find((a) => a.type === "version");
    const pack = wanted?.type === "version" && actions.some((a) => a.type === "verse") ? bible.packs.find((p) => p.id === wanted.id) ?? null : null;
    for (const a of actions) if (!(pack && a === wanted)) await runAi(a, said, confidence, pack);
    return true;
  }

  async function runAi(a: AiAction, said: string, confidence: number, pack: { id: string; abbreviation: string } | null = null) {
    const groups = get().commandGroups;
    // The AI may only jump to a verse or chapter when a number was said in this very sentence.
    if ((a.type === "go_verse" || a.type === "go_chapter") && !/\d/.test(wordsToNumbers(said))) return;
    const run = async (c: Cmd, group: keyof typeof groups) => {
      if (!groups[group]) return;
      const r = await get().runCommand(c);
      noteLast(`AI: ${describeCommand(c)} → ${r.note}`, r.ok);
    };
    const packs = useBibleStore.getState().packs;
    switch (a.type) {
      case "verse": {
        const ref = parseReference(a.reference);
        if (!ref) return;
        // Check the verse really says what was heard (the AI must not put a wrong verse up).
        if (a.how !== "named" && (a.confidence ?? 0) < 0.85) {
          const ok = await verseMatches(ref, `${recent.slice(-1)[0] ?? ""} ${said}`);
          if (!ok) return;
        }
        detect(ref, said, Math.max(confidence, a.confidence ?? 0.7), "AI", pack);
        noteLast(`AI: ${formatReference(ref)}${a.how === "paraphrased" ? " (said in other words)" : ""}`, true);
        return;
      }
      case "version": { const p = packs.find((x) => x.id === a.id); if (p) await run({ type: "version", query: p.abbreviation }, "bible"); return; }
      case "second_version": {
        if (!a.id) return run({ type: "secondOff" }, "bible");
        const p = packs.find((x) => x.id === a.id); if (p) await run({ type: "version", query: p.abbreviation, second: true }, "bible");
        return;
      }
      case "next_verse": return run({ type: "verse", delta: 1 }, "bible");
      case "previous_verse": return run({ type: "verse", delta: -1 }, "bible");
      case "go_verse": return run({ type: "gotoVerse", start: a.verse, end: a.to }, "bible");
      case "go_chapter": return run({ type: "chapter", chapter: a.chapter, start: a.verse }, "bible");
      case "clear": return run({ type: "clear" }, "screen");
      case "black": return run({ type: "black" }, "screen");
      case "show_again": return run({ type: "show" }, "banner");
    }
  }

  return {
    status: "off",
    message: null,
    recognizer: null,
    level: 0,
    partial: "",
    partialSure: "",
    lines: [],
    detections: [],
    pending: null,
    shown: null,

    mode: "ask",
    autoDelay: 3,
    minConfidence: 0.55,
    matchQuotes: true,
    setMatchQuotes: (matchQuotes) => set({ matchQuotes }),
    matchSongs: true,
    setMatchSongs: (matchSongs) => set({ matchSongs }),
    aiOn: true,
    setAiOn: (aiOn) => set({ aiOn }),
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
          // "Romans chapter 8" … "verse 28": finishes the suggestion that is waiting, not what is on screen.
          const open = get().pending;
          if (open && !open.song && open.status === "waiting" && !open.ref.verseStart && Date.now() - open.at < 15_000) {
            detect({ ...open.ref, verseStart: c.start, verseEnd: c.end }, open.said, 0.9);
            return { ok: true, note: get().pending?.label ?? "" };
          }
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
      if (get().engine === "twi") {
        // Twi (and Twi mixed with English): Khaya by GhanaNLP, through the WorshipHQ server. The AI then works out what was meant.
        await startWhisperListening(get().micId, {
          onLevel: (level) => set({ level }),
          onSpeaking: (speaking) => { if (speaking) set({ partial: "…", partialSure: "" }); },
          onText: (text) => get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.9, kind: "speech" })),
          onError: (message) => set({ status: "error", message }),
        }, { live: "twi", best: null, online: true });
        if (get().status === "starting") set({ status: "listening", recognizer: "Twi listening (Khaya by GhanaNLP) + WorshipHQ AI" });
        return;
      }
      if (get().engine === "whisper") {
        if (get().whisperInstalled === null) await get().checkWhisper();
        if (!get().whisperInstalled) {
          set({ status: "error", message: "Whisper isn't downloaded yet. Go to Settings › Audio & microphone and press Download Whisper (one time, about 155 MB)." });
          return;
        }
        // The fastest model shows the words as they are said; the chosen one then tidies finished sentences.
        set({ recognizer: "Loading the speech model…" });
        const { invoke } = await import("@tauri-apps/api/core");
        const chosen = get().whisperModel;
        // Twi has no smaller model, so it does both.
        const hasTiny = get().whisperModels.includes("tiny");
        const two = chosen !== "twi" && chosen !== "tiny" && hasTiny
          && await invoke("whisper_start", { model: "tiny", live: true }).then(() => true, () => false);
        await invoke("whisper_start", { model: chosen, live: !two }).catch(() => { /* reported when the first sentence fails */ });
        if (get().status !== "starting") { invoke("whisper_stop").catch(() => {}); return; }
        // Live listening needs the small "Fastest" model too: fetch it quietly for next time.
        if (!hasTiny && chosen !== "twi") invoke("whisper_install", { model: "tiny" }).then(() => get().checkWhisper()).catch(() => {});
        await startWhisperListening(get().micId, {
          onLevel: (level) => set({ level }),
          onSpeaking: (speaking) => { if (speaking) set({ partial: "…", partialSure: "" }); },
          onLive: ({ sure, maybe, text, id: sentenceId }) => {
            set({ partial: `${sure} ${maybe}`.trim(), partialSure: sure });
            followLive(sure);
            const st = get();
            if (!st.commandsOn) return;
            // A number may still grow ("verse 2" → "verse 28"), so those wait until it is sure.
            if (/\d|verse (?:one|two|three|four|five|six|seven|eight|nine|ten|\w+teen|\w+ty)|chapter \w+/i.test(text)) text = sure;
            const cmd = parseVoiceCommand(text, st.wakeWord || undefined);
            // Single words ("next", "back") could still become "next chapter": wait for those.
            if (!cmd || text.trim().split(/\s+/).length < 2 || !st.commandGroups[COMMAND_GROUP[cmd.type]]) return;
            if (cmd.type === "version" && !findPack(cmd.query, useBibleStore.getState().packs)) return;
            const key = commandKey(cmd);
            if (earlyDone && earlyDone.key === key && Date.now() - earlyDone.at < 4000) return;
            earlyDone = { key, at: Date.now(), id: sentenceId };
            get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.9, kind: "speech", early: true }));
          },
          onText: (text, id, draft) => get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.9, kind: "speech", id, draft })),
          onSettled: (text, id) => get().handleEvent(JSON.stringify({ type: "heard", text, confidence: 0.92, kind: "speech", id, refine: true })),
          onError: (message) => set({ status: "error", message }),
        }, { live: two ? "tiny" : chosen, best: two ? chosen : null });
        const name = WHISPER_MODELS.find((x) => x.id === chosen)?.label ?? "";
        if (get().status === "starting") set({ status: "listening", recognizer: `Whisper ${two ? `Fastest for live words, ${name} for finished sentences` : name} (OpenAI) on this computer` });
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
          const lineId = String(msg.id ?? crypto.randomUUID());
          const refine = !!msg.refine;
          // Already acted on as a command from the quick reading: only tidy the words.
          if (refine && st.lines.find((l) => l.id === lineId)?.command) { addLine(text, false, lineId, true); break; }
          let cmd = st.commandsOn ? parseVoiceCommand(text, st.wakeWord || undefined) : null;
          if (cmd?.type === "version" && !findPack(cmd.query, useBibleStore.getState().packs)) cmd = null;
          if (cmd) {
            // Already done from the early guess while it was being said.
            if (!msg.early && earlyDone && earlyDone.id === lineId) { if (!refine) set({ partial: "", partialSure: "" }); break; }
            const id = lineId;
            const allowed = st.commandGroups[COMMAND_GROUP[cmd.type]];
            const name = describeCommand(cmd);
            set((s) => ({ lines: [{ id, text, at: Date.now(), isReference: false, command: allowed ? name : name + " (switched off in Settings)", commandOk: allowed }, ...s.lines.filter((l) => l.id !== id)].slice(0, MAX_LINES), ...(refine ? {} : { partial: "", partialSure: "" }) }));
            if (allowed) {
              get().runCommand(cmd).then((r) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, command: name + " → " + r.note, commandOk: r.ok } : l)) })));
            }
            break;
          }
          // A line from a song in the library?
          if (st.matchSongs && confidence >= 0.4) {
            const hit = findSongLine(text);
            if (hit) {
              // The better reading arrives a little later: don't jump the song back to where it was then.
              addLine(text, refine ? true : heardSong(hit, text, confidence) === "suggested", lineId, refine);
              break;
            }
          }
          let ref: ScriptureRef | null = null;
          if (msg.kind === "reference" && typeof msg.book === "number") ref = referenceFromHeard(text, msg.book);
          // Free speech: only trust a reference it clearly heard.
          if (!ref && confidence >= 0.3) ref = referenceInSpeech(text);
          addLine(text, !!ref, lineId, refine);
          if (ref && confidence >= get().minConfidence * (msg.kind === "reference" ? 1 : 0.7)) detect(ref, text, confidence, undefined, askedPack(text));
          // A better reading is on its way: the AI and the search wait for it.
          else if (msg.draft) break;
          else if (!ref && get().aiOn && !msg.early && text.split(/\s+/).length >= 3 && worthAsking(text)) {
            // The AI works out what was meant; if it can't be reached, the exact-wording search still runs.
            askAi(text, confidence).then((handled) => {
              if (!handled && get().matchQuotes && confidence >= 0.4) findQuotedVerse(text).then((q) => { if (q) detect(q, text, confidence); });
            });
          } else if (!ref && get().matchQuotes && confidence >= 0.4) findQuotedVerse(text).then((q) => { if (q) detect(q, text, confidence); });
          if (!msg.early && !msg.draft) { recent.push(text); if (recent.length > 8) recent.shift(); }
          break;
        }
      }
    },

    tryText: (text) => {
      const t = text.trim();
      if (!t) return;
      // Exactly as if it had been heard: commands, songs, Bible references.
      get().handleEvent(JSON.stringify({ type: "heard", text: t, confidence: 1, kind: "speech" }));
    },

    showDetection: async (id) => {
      const det = get().detections.find((d) => d.id === id);
      if (!det) return;
      if (det.song) {
        const song = useSongStore.getState().songs.find((x) => x.id === det.song!.id);
        if (song) {
          const slides = buildSongSlides(song);
          useShowStore.getState().setPreview(song.title, slides, det.song.slide, song.id);
          useShowStore.getState().sendPreviewLive(det.song.slide);
        }
        set((s) => ({ pending: s.pending?.id === id ? null : s.pending, detections: s.detections.map((d) => (d.id === id ? { ...d, status: "shown" } : d)) }));
        return;
      }
      const bible = useBibleStore.getState();
      if (!bible.packs.length) await bible.loadPacks();
      if (det.packId && det.packId !== useBibleStore.getState().activePack) bible.setActivePack(det.packId);
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
  partialize: (s) => ({ aiOn: s.aiOn, matchSongs: s.matchSongs, mode: s.mode, autoDelay: s.autoDelay, minConfidence: s.minConfidence, matchQuotes: s.matchQuotes, engine: s.engine, micId: s.micId, commandsOn: s.commandsOn, commandGroups: s.commandGroups, wakeWord: s.wakeWord, whisperModel: s.whisperModel, autoStart: s.autoStart }),
  merge: (persisted, current) => ({
    ...current,
    ...(persisted as object),
    // The online Twi engine was never switched on; Twi is now the offline Twi model.
    ...((persisted as { engine?: string } | undefined)?.engine === "twi" ? { engine: "whisper" as VoiceEngine, whisperModel: "twi" as WhisperModel } : {}),
    commandGroups: { ...current.commandGroups, ...((persisted as { commandGroups?: object } | undefined)?.commandGroups ?? {}) },
  }),
}));
