/**
 * Records the chosen microphone, cuts the audio into sentences (when the speaker pauses) and sends each one
 * to Whisper on this computer. Calls back with the level (0–100), "speaking" changes and the recognised text.
 */

interface Callbacks {
  onLevel: (level: number) => void;
  onSpeaking: (speaking: boolean) => void;
  onText: (text: string) => void;
  onError: (message: string) => void;
}

const RATE = 16000;
const SILENCE_MS = 700;     // a pause this long ends a sentence
const MAX_MS = 12000;       // never send more than this at once
const MIN_MS = 500;         // ignore coughs and clicks

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

export async function startWhisperListening(deviceId: string | null, cb: Callbacks) {
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
  node = ctx.createScriptProcessor(2048, 1, 1);
  src.connect(node);
  node.connect(ctx.destination);
  running = true;

  let noise = 0.008;              // learns the room's background level
  let chunks: Float32Array[] = [];
  let speaking = false;
  let silentMs = 0;
  let speechMs = 0;
  const queue: Uint8Array[] = [];
  let busy = false;

  const pump = async () => {
    if (busy || !queue.length) return;
    busy = true;
    const audio = queue.shift()!;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const text = await invoke<string>("whisper_transcribe", audio as unknown as Record<string, unknown>);
      if (running && !junk(text)) cb.onText(text.trim());
    } catch (e) {
      if (running) cb.onError(String(e));
    }
    busy = false;
    pump();
  };

  const flush = () => {
    if (speechMs >= MIN_MS) {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      if (queue.length < 3) queue.push(wav(all));
      pump();
    }
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
      if (silentMs >= SILENCE_MS) { speaking = false; cb.onSpeaking(false); flush(); }
    }
    if (speaking && speechMs + silentMs >= MAX_MS) flush();
  };
}

export async function stopWhisperListening() {
  running = false;
  if (node) { node.onaudioprocess = null; node.disconnect(); node = null; }
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) { await ctx.close().catch(() => {}); ctx = null; }
}
