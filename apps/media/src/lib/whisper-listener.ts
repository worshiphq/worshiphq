/**
 * Records the chosen microphone, cuts the audio into sentences (when the speaker pauses) and sends each one
 * to Whisper on this computer. Calls back with the level (0–100), "speaking" changes and the recognised text.
 *
 * While someone is still speaking, the audio so far is transcribed again and again, so the words appear as they are
 * said (see live-words.ts). How often depends on how fast this computer is: a finished sentence always comes first.
 */
import { LiveWords, quietestCut } from "./live-words";


interface Callbacks {
  onLevel: (level: number) => void;
  onSpeaking: (speaking: boolean) => void;
  /** A finished sentence. "draft" = a better reading of it follows in onSettled. */
  onText: (text: string, id: string, draft: boolean) => void;
  /** The better reading of a draft (or the same words, when it would have come too late). */
  onSettled?: (text: string, id: string) => void;
  /** The sentence still going on: the words it is sure of, and the newest ones it isn't sure of yet. */
  onLive?: (live: { sure: string; maybe: string; text: string; id: string }) => void;
  onError: (message: string) => void;
}

/** live: reads the words as they are said. best: a better model for finished sentences (null = the same one). */
export interface ListenModels { live: string; best: string | null; online?: boolean }

const RATE = 16000;
const SILENCE_MS = 450;     // a pause this long ends a sentence
const MAX_MS = 7000;        // longer speech is cut (the model is set up for 10 s; shorter is quicker to read again)
const MIN_MS = 350;         // ignore coughs and clicks
const LIVE_EVERY_MS = 250;  // gap between readings of the sentence so far (longer on a slow computer)
const LIVE_TOO_SLOW_MS = 2500; // a reading this slow would hold up finished sentences: don't read mid-sentence
const CUT_BACK_MS = 2000;   // when a sentence is too long, cut at the quietest moment in its last 2 s
const STALE_MS = 4000;      // never act on speech this long after it was said: keep up with the speaker instead
const BEST_LATE_MS = 6000;  // a better reading later than this is no use

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: ScriptProcessorNode | null = null;
let running = false;
let generation = 0;

function wav(samples: Float32Array): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Whisper sometimes "hears" these in silence or music. */
function junk(text: string): boolean {
  const t = text.trim().toLowerCase();
  return !t || /^[\[(].*[\])]$/.test(t) || ["thank you.", "thanks for watching!", "you", "."].includes(t);
}

function join(chunks: Float32Array[]): Float32Array {
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return all;
}

export async function startWhisperListening(deviceId: string | null, cb: Callbacks, models: ListenModels) {
  const { best, online = false } = models;
  await stopWhisperListening();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    cb.onError("WorshipHQ couldn't open the microphone. Check it is plugged in and that Windows allows apps to use the microphone.");
    return;
  }
  ctx = new AudioContext({ sampleRate: RATE });
  const src = ctx.createMediaStreamSource(stream);
  node = ctx.createScriptProcessor(1024, 1, 1);
  src.connect(node);
  node.connect(ctx.destination);
  running = true;
  const { invoke } = await import("@tauri-apps/api/core");
  const read = (audio: Float32Array, live: boolean): Promise<string> => {
    const body = wav(audio);
    if (online) return import("./ai").then(({ transcribeTwi }) => transcribeTwi(body));
    const headers: Record<string, string> = { "x-model": live ? models.live : best! };
    if (live) headers["x-live"] = "1";
    return invoke<string>("whisper_transcribe", body as unknown as Record<string, unknown>, { headers });
  };
  const gen = ++generation;       // listening was stopped (and perhaps started again): ignore what is still coming
  const on = () => running && gen === generation;

  let noise = 0.008;              // learns the room's background level
  let chunks: Float32Array[] = [];
  let speaking = false;
  let silentMs = 0;
  let speechMs = 0;
  let sentence = crypto.randomUUID(); // the sentence being spoken (a reading of an old one is thrown away)
  let lastLiveAt = 0;
  let readMs = 0;                 // how long this computer takes to read a sentence so far
  let levels: number[] = [];      // loudness of each block in "chunks"
  const live = new LiveWords();
  interface Said { id: string; audio: Float32Array; at: number }
  let queue: Said[] = [];
  let busy = false;

  const timed = async (audio: Float32Array) => {
    const at = performance.now();
    const text = (await read(audio, true)).trim();
    const took = performance.now() - at;
    readMs = readMs ? readMs * 0.7 + took * 0.3 : took;
    return text;
  };

  /* The better model works on the newest finished sentence only: anything it is too late for is left as it was. */
  let bestBusy = false;
  let bestNext: (Said & { draft: string }) | null = null;
  const improve = async (s: Said & { draft: string }) => {
    if (bestBusy) {
      if (bestNext) cb.onSettled?.(bestNext.draft, bestNext.id);
      bestNext = s;
      return;
    }
    bestBusy = true;
    let text = s.draft;
    try {
      const better = (await read(s.audio, false)).trim();
      if (!junk(better) && performance.now() - s.at < BEST_LATE_MS) text = better;
    } catch { /* keep the quick reading */ }
    if (on()) cb.onSettled?.(text, s.id);
    bestBusy = false;
    const next = bestNext;
    bestNext = null;
    if (next && on()) improve(next);
  };

  const pump = async () => {
    if (busy || !queue.length || !on()) return;
    busy = true;
    // Fallen behind? Let go of what is too old (the newest always stays), and read short ones together.
    queue = queue.filter((q, i) => i === queue.length - 1 || performance.now() - q.at < STALE_MS);
    let s = queue.shift()!;
    while (queue.length && s.audio.length + queue[0].audio.length <= (MAX_MS / 1000) * RATE) {
      const n = queue.shift()!;
      s = { id: n.id, at: n.at, audio: join([s.audio, n.audio]) };
    }
    try {
      const text = await timed(s.audio);
      if (on() && !junk(text)) {
        cb.onText(text, s.id, !!best);
        if (best) improve({ ...s, draft: text });
      }
    } catch (e) {
      if (on()) cb.onError(String(e));
    }
    busy = false;
    pump();
  };

  /** Reads the sentence still being spoken (a finished sentence always goes first). */
  const readLive = async () => {
    if (!cb.onLive || busy || queue.length) return;
    busy = true;
    const mine = sentence;
    try {
      const text = await timed(join(chunks));
      if (on() && mine === sentence && !junk(text)) cb.onLive({ ...live.push(text), text, id: mine });
    } catch { /* the finished sentence is still to come */ }
    busy = false;
    pump();
  };

  /** Ends the sentence; "tooLong" keeps what comes after the cut for the next one. */
  const flush = (tooLong = false) => {
    const at = tooLong ? quietestCut(levels, Math.round(CUT_BACK_MS / ((1024 / RATE) * 1000))) : chunks.length;
    const rest = chunks.slice(at), restLevels = levels.slice(at);
    if (speechMs >= MIN_MS) {
      queue.push({ id: sentence, audio: join(chunks.slice(0, at)), at: performance.now() });
      pump();
    }
    sentence = crypto.randomUUID();
    live.reset();
    chunks = rest;
    levels = restLevels;
    speechMs = (rest.length * 1024 / RATE) * 1000;
    silentMs = 0;
  };

  node.onaudioprocess = (e) => {
    if (!on()) return;
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0;
    for (const x of data) sum += x * x;
    const rms = Math.sqrt(sum / data.length);
    cb.onLevel(Math.min(100, Math.round(rms * 400)));
    const ms = (data.length / RATE) * 1000;
    const threshold = Math.max(0.012, noise * 3);
    const loud = rms > threshold;
    if (!loud) noise = noise * 0.98 + rms * 0.02;

    if (loud) {
      if (!speaking) { speaking = true; cb.onSpeaking(true); }
      silentMs = 0;
      speechMs += ms;
      chunks.push(data); levels.push(rms);
    } else if (speaking) {
      silentMs += ms;
      chunks.push(data); levels.push(rms);
      if (silentMs >= SILENCE_MS) { speaking = false; cb.onSpeaking(false); flush(); return; }
    }
    if (speaking && speechMs + silentMs >= MAX_MS) { flush(true); return; }
    // Not for online listening, where every reading costs money.
    const wait = Math.max(LIVE_EVERY_MS, readMs * 0.3);
    if (!online && speaking && speechMs >= 500 && readMs < LIVE_TOO_SLOW_MS && performance.now() - lastLiveAt >= wait && !busy) {
      readLive().then(() => { lastLiveAt = performance.now(); });
    }
  };
}

export async function stopWhisperListening() {
  running = false;
  if (node) { node.onaudioprocess = null; node.disconnect(); node = null; }
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) { await ctx.close().catch(() => {}); ctx = null; }
}
