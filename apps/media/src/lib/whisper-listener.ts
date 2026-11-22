/**
 * Records the chosen microphone, cuts the audio into sentences (when the speaker pauses) and sends each one
 * to Whisper on this computer. Calls back with the level (0–100), "speaking" changes and the recognised text.
 *
 * For speed, while someone is still speaking a short sentence, the audio so far is also sent as an "early" guess,
 * so a command like "next verse" can act before the pause has even finished.
 */

interface Callbacks {
  onLevel: (level: number) => void;
  onSpeaking: (speaking: boolean) => void;
  onText: (text: string) => void;
  /** What has been said so far in the sentence that is still going on. */
  onEarly?: (text: string) => void;
  onError: (message: string) => void;
}

const RATE = 16000;
const SILENCE_MS = 450;     // a pause this long ends a sentence
const MAX_MS = 10000;       // never send more than this at once (Whisper is set up for 10 s)
const MIN_MS = 350;         // ignore coughs and clicks
const EARLY_EVERY_MS = 700; // early guesses while a short sentence is being spoken…
const EARLY_UNTIL_MS = 3500; // …only for the first few seconds (commands are short)

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: ScriptProcessorNode | null = null;
let running = false;

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

export async function startWhisperListening(deviceId: string | null, cb: Callbacks, model = "base") {
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
  const transcribe = (audio: Uint8Array) =>
    invoke<string>("whisper_transcribe", audio as unknown as Record<string, unknown>, { headers: { "x-model": model } });

  let noise = 0.008;              // learns the room's background level
  let chunks: Float32Array[] = [];
  let speaking = false;
  let silentMs = 0;
  let speechMs = 0;
  let sentence = 0;               // which sentence we are in (early guesses for an old one are dropped)
  let lastEarlyAt = 0;
  const queue: Uint8Array[] = [];
  let busy = false;

  const pump = async () => {
    if (busy || !queue.length) return;
    busy = true;
    const audio = queue.shift()!;
    try {
      const text = await transcribe(audio);
      if (running && !junk(text)) cb.onText(text.trim());
    } catch (e) {
      if (running) cb.onError(String(e));
    }
    busy = false;
    pump();
  };

  /** A quick guess at the sentence still being spoken (never holds up a finished sentence). */
  const early = async () => {
    if (!cb.onEarly || busy || queue.length) return;
    busy = true;
    const mine = sentence;
    try {
      const text = await transcribe(wav(join(chunks)));
      if (running && mine === sentence && !junk(text)) cb.onEarly(text.trim());
    } catch { /* only a guess */ }
    busy = false;
    pump();
  };

  const flush = () => {
    if (speechMs >= MIN_MS) {
      if (queue.length < 3) queue.push(wav(join(chunks)));
      pump();
    }
    sentence++;
    chunks = [];
    speechMs = 0;
    silentMs = 0;
  };

  node.onaudioprocess = (e) => {
    if (!running) return;
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
      chunks.push(data);
    } else if (speaking) {
      silentMs += ms;
      chunks.push(data);
      if (silentMs >= SILENCE_MS) { speaking = false; cb.onSpeaking(false); flush(); return; }
    }
    if (speaking && speechMs + silentMs >= MAX_MS) { flush(); return; }
    // Early guess: short sentences only, every ~0.7 s, as soon as there is enough to hear a command.
    const length = speechMs + silentMs;
    if (speaking && speechMs >= 500 && length <= EARLY_UNTIL_MS && performance.now() - lastEarlyAt >= EARLY_EVERY_MS) {
      lastEarlyAt = performance.now();
      early();
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
