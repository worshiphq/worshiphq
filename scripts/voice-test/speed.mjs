// How long each offline model takes on this computer, by clip length, threads and audio context.
//   node scripts/voice-test/speed.mjs voice-tests/robot-rate0.wav [models]
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
const dir = path.join(process.env.APPDATA, "com.worshiphq.media", "whisper");
const FILES = { tiny: "ggml-tiny.en.bin", base: "ggml-base.en.bin", small: "ggml-small.en.bin", turbo: "ggml-large-v3-turbo-q5_0.bin" };
const PROMPT = "Romans chapter 8 verse 28. Habakkuk, Philippians.";
const PORT = 18279;
const clip = (s) => execFileSync("ffmpeg", ["-v", "error", "-i", process.argv[2], "-ss", "2", "-t", String(s), "-ac", "1", "-ar", "16000", "-f", "wav", "-"], { maxBuffer: 1 << 28 });
const clips = { 2: clip(2), 5: clip(5), 9: clip(9) };
for (const m of (process.argv[3] ?? "tiny,base,small").split(",")) for (const threads of [4, 6]) for (const prompt of [true, false]) {
  if (!prompt && threads !== 4) continue;
  const p = spawn(path.join(dir, "whisper-server.exe"), ["-m", FILES[m], "-t", String(threads), "-l", "en", "--host", "127.0.0.1", "--port", String(PORT), "-nt", "-bo", "1", "-nf", ...(prompt ? ["--prompt", PROMPT] : [])], { cwd: dir, stdio: "ignore", windowsHide: true });
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); up = await fetch(`http://127.0.0.1:${PORT}/`).then(() => true, () => false); }
    for (const [sec, w] of Object.entries(clips)) for (const ac of [512, Math.max(192, Math.ceil(sec * 50 / 64) * 64 + 64)]) {
      const times = []; let text = "";
      for (let i = 0; i < 3; i++) {
        const f = new FormData(); f.append("file", new Blob([w]), "a.wav"); f.append("response_format", "json"); f.append("temperature", "0.0"); f.append("audio_ctx", String(ac));
        const t = performance.now(); text = (await (await fetch(`http://127.0.0.1:${PORT}/inference`, { method: "POST", body: f })).json()).text; times.push(performance.now() - t);
      }
      console.log(`${m} t${threads} prompt:${prompt ? "y" : "n"} ${sec}s ac${ac}: ${(Math.min(...times) / 1000).toFixed(2)}s  ${text.trim().replace(/\s+/g, " ").slice(0, 90)}`);
    }
  } finally { const gone = new Promise((r) => p.once("exit", r)); p.kill(); await gone; }
}
