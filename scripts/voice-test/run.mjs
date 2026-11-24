// Voice accuracy test for WorshipHQ Live: runs one recording through the offline models (with the app's settings)
// and, when asked, online services, then compares the mistakes.
//   node --env-file=.env scripts/voice-test/run.mjs voice-tests/sermon.mp3 [--ref voice-tests/sermon.txt]
//        [--models tiny,base,small,turbo,twi] [--online groq,deepgram,openai] [--minutes 10]
// --ref is what was really said, typed by a person. Without it accuracy can't be scored, only compared by eye.
// --online sends the audio to that company and costs a little money, so it is off unless named.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv[i + 1]; };
const input = argv[0];
if (!input || !fs.existsSync(input)) { console.error("Give the recording, e.g. voice-tests/sermon.mp3"); process.exit(1); }
const models = opt("models", "tiny,base,small,turbo,twi").split(",").filter(Boolean);
const online = opt("online", "").split(",").filter(Boolean);
const refFile = opt("ref", null);
const ref = refFile ? fs.readFileSync(refFile, "utf8") : null;
const RATE = 16000, SILENCE = 450, MAX = 10000, MIN = 350, FRAME = 1024; // the same as whisper-listener.ts

// The prompt and flags come from the app's own source, so the test can't drift from it.
const rs = fs.readFileSync("apps/media/src-tauri/src/whisper.rs", "utf8");
const PROMPT = rs.match(/const PROMPT: &str = "([^"]+)"/)[1];
const FAST = [...rs.match(/const FAST[^=]*= \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", input, "-t", String(Number(opt("minutes", 10)) * 60), "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.length & ~3)));
const seconds = samples.length / RATE;

function wav(s) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) { const x = Math.max(-1, Math.min(1, s[i])); b.writeInt16LE(Math.trunc(x < 0 ? x * 32768 : x * 32767), 44 + i * 2); }
  return b;
}

// Cut into sentences the way the app does.
function cut() {
  const out = [];
  let noise = 0.008, speaking = false, silent = 0, speech = 0, parts = [], capped = 0;
  const flush = (t) => {
    if (speech >= MIN) {
      const s = new Float32Array(parts.reduce((a, c) => a + c.length, 0));
      let o = 0;
      for (const c of parts) { s.set(c, o); o += c.length; }
      out.push({ end: t, samples: s });
    }
    parts = []; speech = silent = 0;
  };
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    const d = samples.subarray(i, i + FRAME), ms = (FRAME / RATE) * 1000, t = (i + FRAME) / RATE;
    let sum = 0;
    for (const x of d) sum += x * x;
    const rms = Math.sqrt(sum / FRAME), loud = rms > Math.max(0.012, noise * 3);
    if (!loud) noise = noise * 0.98 + rms * 0.02;
    if (loud) { speaking = true; silent = 0; speech += ms; parts.push(d); }
    else if (speaking) { silent += ms; parts.push(d); if (silent >= SILENCE) { speaking = false; flush(t); continue; } }
    if (speaking && speech + silent >= MAX) { capped++; flush(t); }
  }
  if (parts.length) flush(seconds);
  return { chunks: out, capped };
}
const { chunks, capped } = cut();

const norm = (s) => s.normalize("NFC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
function wer(r, h) {
  let p = Array.from({ length: h.length + 1 }, (_, i) => i);
  for (let i = 1; i <= r.length; i++) {
    const c = [i];
    for (let j = 1; j <= h.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    p = c;
  }
  return p[h.length] / Math.max(1, r.length);
}

// What the operator would really get: one at a time, and the app drops a sentence when three are already waiting.
function live(times) {
  const start = [], dropped = [], lag = [];
  let free = 0;
  chunks.forEach((c, i) => {
    if (start.filter((s) => s > c.end).length >= 3) { dropped.push(i); return; }
    const s = Math.max(free, c.end);
    start.push(s); free = s + times[i]; lag.push(free - c.end);
  });
  lag.sort((a, b) => a - b);
  return { dropped, median: lag[lag.length >> 1] ?? 0, worst: lag.at(-1) ?? 0 };
}

const rows = [];
async function each(name, f) {
  const texts = [], times = [];
  for (let i = 0; i < chunks.length; i++) {
    const t = performance.now();
    texts.push((await f(wav(chunks[i].samples))).replace(/\s+/g, " ").trim());
    times.push((performance.now() - t) / 1000);
  }
  const l = live(times), full = texts.join(" "), kept = texts.filter((_, i) => !l.dropped.includes(i)).join(" ");
  rows.push({ name, full, dropped: l.dropped.length, median: l.median, worst: l.worst, wer: ref ? wer(norm(ref), norm(full)) : null, liveWer: ref ? wer(norm(ref), norm(kept)) : null });
  console.log(`${name}: done`);
}
const form = (w, extra) => { const f = new FormData(); f.append("file", new Blob([w], { type: "audio/wav" }), "speech.wav"); for (const [k, v] of Object.entries(extra)) f.append(k, v); return f; };
async function ok(r, who) { if (!r.ok) throw new Error(`${who} answered ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); }

const dir = path.join(process.env.APPDATA, "com.worshiphq.media", "whisper");
const FILES = { tiny: "ggml-tiny.en.bin", base: "ggml-base.en.bin", small: "ggml-small.en.bin", turbo: "ggml-large-v3-turbo-q5_0.bin", twi: "ggml-twi-small-q5_0.bin" };
const PORT = 18279; // not the app's own port
for (const m of models) {
  if (!FILES[m] || !fs.existsSync(path.join(dir, FILES[m]))) { console.log(`${m}: not downloaded, skipped`); continue; }
  const threads = String(Math.min(6, Math.max(2, os.cpus().length)));
  const p = spawn(path.join(dir, "whisper-server.exe"), ["-m", FILES[m], "-t", threads, "-l", "en", "--host", "127.0.0.1", "--port", String(PORT), "-nt", ...(m === "twi" ? [] : ["--prompt", PROMPT]), ...FAST], { cwd: dir, stdio: "ignore", windowsHide: true });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); up = await fetch(`http://127.0.0.1:${PORT}/`).then(() => true, () => false); }
    if (!up) throw new Error("the model did not start");
    const ask = async (w) => (await ok(await fetch(`http://127.0.0.1:${PORT}/inference`, { method: "POST", body: form(w, { response_format: "json", temperature: "0.0" }) }), m)).text;
    if (chunks[0]) await ask(wav(chunks[0].samples)); // warm up
    await each(`Offline ${m}`, ask);
  } catch (e) { console.log(`${m}: failed, ${e.message}`); }
  finally { if (p.exitCode === null) { const gone = new Promise((r) => p.once("exit", r)); p.kill(); await gone; } }
}

const ONLINE = {
  groq: ["GROQ_API_KEY", (k) => async (w) => (await ok(await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${k}` }, body: form(w, { model: "whisper-large-v3-turbo", temperature: "0", prompt: PROMPT }) }), "Groq")).text],
  openai: ["OPENAI_API_KEY", (k) => async (w) => (await ok(await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${k}` }, body: form(w, { model: "gpt-4o-mini-transcribe" }) }), "OpenAI")).text],
  deepgram: ["DEEPGRAM_API_KEY", (k) => async (w) => (await ok(await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", { method: "POST", headers: { Authorization: `Token ${k}`, "Content-Type": "audio/wav" }, body: w }), "Deepgram")).results.channels[0].alternatives[0].transcript],
};
for (const o of online) {
  const [env, make] = ONLINE[o] ?? [];
  if (!make || !process.env[env]) { console.log(`${o}: skipped (${env ?? "unknown service"} is not set)`); continue; }
  try { await each(`Online ${o}`, make(process.env[env])); } catch (e) { console.log(`${o}: failed, ${e.message}`); }
}

const billed = chunks.reduce((n, c) => n + Math.max(10, c.samples.length / RATE), 0);
const pct = (x) => (x === null ? "n/a" : Math.max(0, (1 - x) * 100).toFixed(1) + "%");
const lines = [
  `Recording: ${path.basename(input)}, ${(seconds / 60).toFixed(1)} min, ${chunks.length} pieces, ${capped} cut at 10 s (possibly mid-word)`,
  ref ? `Typed reference: ${norm(ref).length} words, ${(norm(ref).length / (seconds / 60)).toFixed(0)} words a minute` : "No typed reference: accuracy cannot be scored.",
  `Groq would bill ${(billed / seconds).toFixed(2)}x the recording length (10 s minimum a piece, no early guesses)`, "",
  "Engine              Accuracy  Live acc.  Dropped  Delay  Worst",
  ...rows.map((r) => [r.name.padEnd(18), pct(r.wer).padEnd(8), pct(r.liveWer).padEnd(9), String(r.dropped).padEnd(7), (r.median.toFixed(1) + "s").padEnd(5), r.worst.toFixed(1) + "s"].join("  ")), "",
  "Accuracy = every piece transcribed. Live acc. = after the pieces the app would have dropped. Delay starts when a piece ends.",
  "Not included: the app's microphone noise reduction and early guesses.",
];
console.log("\n" + lines.join("\n"));
fs.mkdirSync("voice-tests", { recursive: true });
const out = path.join("voice-tests", `${path.parse(input).name}-results.txt`);
fs.writeFileSync(out, lines.join("\n") + "\n" + rows.map((r) => `\n=== ${r.name}\n${r.full}\n`).join(""));
console.log(`\nSaved with every transcript: ${out}`);
