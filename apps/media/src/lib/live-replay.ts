/**
 * Not part of the app: plays a timed recording through the real listening code at real speed and measures how long
 * each word takes to appear. Run from apps/media:
 *   npx tsx src/lib/live-replay.ts ../../voice-tests/timed base
 */
// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const [base, chosen = "base"] = process.argv.slice(2);
const pcm = fs.readFileSync(base + ".wav").subarray(44);
const spoken = JSON.parse(fs.readFileSync(base + ".json", "utf8"));
const dir = path.join(process.env.APPDATA, "com.worshiphq.media", "whisper");
const rs = fs.readFileSync("src-tauri/src/whisper.rs", "utf8");
const str = (n) => rs.match(new RegExp(`const ${n}: &str = "([^"]+)"`))[1];
const FILES = { tiny: "ggml-tiny.en.bin", base: "ggml-base.en.bin", small: "ggml-small.en.bin", turbo: "ggml-large-v3-turbo-q5_0.bin" };
const cores = Math.min(6, Math.max(2, Math.floor(os.cpus().length / 2)));
const two = chosen !== "tiny";
const kids = [];
async function serve(model, live) {
  const port = live ? 18380 : 18379;
  const t = live || !two ? cores : Math.max(2, cores - 1);
  const p = spawn(path.join(dir, "whisper-server.exe"), ["-m", FILES[model], "-t", String(t), "-l", "en", "--host", "127.0.0.1", "--port", String(port), "-nt", "--prompt", live ? str("LIVE_PROMPT") : str("PROMPT"), "-ac", "512", "-bo", "1", "-nf"], { cwd: dir, stdio: "ignore", windowsHide: true });
  if (!live) os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  kids.push(p);
  for (let i = 0; i < 120; i++) { if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) return; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error("server did not start");
}
await serve("tiny", true);
if (two) await serve(chosen, false);

globalThis.window = globalThis;
globalThis.window.__TAURI_INTERNALS__ = {
  invoke: async (_cmd, body, opts) => {
    const live = !!opts.headers["x-live"];
    const f = new FormData();
    f.append("file", new Blob([body]), "a.wav"); f.append("response_format", "json"); f.append("temperature", "0.0");
    const at = performance.now();
    const text = (await (await fetch(`http://127.0.0.1:${live ? 18380 : 18379}/inference`, { method: "POST", body: f })).json()).text.replace(/\s+/g, " ").trim();
    const took = (performance.now() - at) / 1000;
    if (took > 2 && live) console.log(`  SLOW live reading: ${took.toFixed(1)} s for ${(body.length / 32000).toFixed(1)} s of sound: ${text.slice(0, 160)}`);
    return text;
  },
};
let node;
Object.defineProperty(globalThis, "navigator", { value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } }, configurable: true });
globalThis.AudioContext = class { createMediaStreamSource() { return { connect() {} }; } createScriptProcessor() { return (node = { connect() {}, disconnect() {}, onaudioprocess: null }); } close() { return Promise.resolve(); } };

const { startWhisperListening, stopWhisperListening } = await import("./whisper-listener");
const { settledReference } = await import("./live-words");
const { formatReference } = await import("./scripture-ref");
const key = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
const seen = new Map(), sureSeen = new Map(), refs = new Map(), sentences = [], better = [];
let t0 = 0;
const at = () => (performance.now() - t0) / 1000;
const note = (map, text) => { for (const w of text.split(/\s+/)) { const k = key(w); if (k && !map.has(k)) map.set(k, at()); } };
await startWhisperListening(null, {
  onLevel() {}, onSpeaking() {},
  onLive: ({ sure, text }) => { note(seen, text); note(sureSeen, sure); const r = settledReference(sure); if (r && !refs.has(formatReference(r.ref))) refs.set(formatReference(r.ref), at()); },
  onText: (text) => { note(seen, text); note(sureSeen, text); sentences.push([at(), text]); },
  onSettled: (text, id) => better.push([at(), text]),
  onError: (m) => console.log("ERROR", m),
}, { live: "tiny", best: two ? chosen : null });

const samples = new Float32Array(pcm.length >> 1);
for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
const padded = new Float32Array(samples.length + 16000 * 2); padded.set(samples);
t0 = performance.now();
for (let i = 0; i + 1024 <= padded.length; i += 1024) {
  const due = t0 + ((i + 1024) / 16000) * 1000, wait = due - performance.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  node.onaudioprocess({ inputBuffer: { getChannelData: () => padded.subarray(i, i + 1024) } });
}
await new Promise((r) => setTimeout(r, 7000));
await stopWhisperListening();
for (const k of kids) k.kill();

// Only words said once, so a match can't be an earlier one.
const count = {}; for (const w of spoken) count[key(w.word)] = (count[key(w.word)] ?? 0) + 1;
const end = samples.length / 16000;
const lag = (map) => spoken.map((w, i) => [key(w.word), w.at, spoken[i + 1]?.at ?? end]).filter(([k]) => k.length > 3 && count[k] === 1 && map.has(k)).map(([k, , e]) => map.get(k) - e).sort((a, b) => a - b);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))]?.toFixed(1);
const unique = spoken.filter((w) => key(w.word).length > 3 && count[key(w.word)] === 1).length;
const shown = lag(seen), sure = lag(sureSeen);
console.log(`\n${chosen}: ${end.toFixed(0)} s of speech, ${(spoken.length / end * 60).toFixed(0)} words a minute`);
console.log(`words appearing:  typical ${q(shown, 0.5)} s after being said, 9 in 10 within ${q(shown, 0.9)} s, slowest ${q(shown, 0.999)} s (${shown.length}/${unique} test words heard exactly)`);
console.log(`words it is sure of: typical ${q(sure, 0.5)} s, 9 in 10 within ${q(sure, 0.9)} s`);
for (const [r, t] of refs) console.log(`mid-sentence reference ${r} at ${t.toFixed(1)} s`);
console.log(`finished sentences: ${sentences.length}; improved: ${better.filter(([, t], i) => t !== sentences[i]?.[1]).length}/${better.length}`);
for (const [t, s] of sentences) console.log(`  ${t.toFixed(1)}  ${s}`);
process.exit(0);
