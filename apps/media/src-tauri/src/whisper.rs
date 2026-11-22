//! Whisper speech recognition (OpenAI Whisper via whisper.cpp, MIT licence): free, offline and far more
//! accurate than the old Windows recogniser. Downloaded on request into the app's data folder.
//!
//! The app records the microphone itself and sends each spoken sentence here as a 16 kHz WAV. While listening,
//! a small Whisper server keeps the model loaded in memory (much faster than loading it for every sentence);
//! if that can't start, each sentence is run through the command-line tool instead.

use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const BIN_URL: &str = "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip";
const ZIP_BYTES: u64 = 8_573_270;
const PORT: u16 = 18178;
/// Each sentence is at most 10 s (the app cuts longer speech), so Whisper only needs 10 s of context.
/// Measured on a 2015 laptop: "Next verse" went from 3.0 s to 0.7–1.2 s.
const FAST: [&str; 5] = ["-ac", "512", "-bo", "1", "-nf"];

/// The speech models people can choose from (id, file name, download size).
pub const MODELS: &[(&str, &str, u64)] = &[
    ("tiny", "ggml-tiny.en.bin", 77_704_715),
    ("base", "ggml-base.en.bin", 147_964_211),
    ("small", "ggml-small.en.bin", 487_614_201),
    ("turbo", "ggml-large-v3-turbo-q5_0.bin", 574_041_195),
];

fn model(id: &str) -> (&'static str, &'static str, u64) {
    MODELS.iter().copied().find(|m| m.0 == id).unwrap_or(MODELS[0])
}

/// Words Whisper should expect, so Bible books are spelled right.
const PROMPT: &str = "Turn with me to John chapter 3 verse 16. Next verse. Verse 2. Genesis, Exodus, Psalm, Proverbs, Isaiah, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, Hebrews, James, 1 Peter, 1 John, Revelation. Amplified, NIV, King James, Twi.";

#[derive(Serialize)]
pub struct WhisperStatus {
    /// The program plus at least one model.
    pub installed: bool,
    /// Which models are on this computer.
    pub models: Vec<String>,
    pub folder: String,
}

fn dir(app_data: &Path) -> PathBuf {
    app_data.join("whisper")
}

fn cli(app_data: &Path) -> PathBuf {
    dir(app_data).join("whisper-cli.exe")
}

fn size(p: &Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

fn model_ready(app_data: &Path, id: &str) -> bool {
    let (_, file, bytes) = model(id);
    size(&dir(app_data).join(file)) >= bytes * 9 / 10
}

pub fn status(app_data: &Path) -> WhisperStatus {
    let models: Vec<String> = MODELS.iter().filter(|m| model_ready(app_data, m.0)).map(|m| m.0.to_string()).collect();
    WhisperStatus {
        installed: cli(app_data).exists() && !models.is_empty(),
        models,
        folder: dir(app_data).to_string_lossy().to_string(),
    }
}

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

/// Downloads the Whisper program (about 8 MB, once) and one speech model.
pub fn install(app_data: &Path, model_id: &str) -> Result<(), String> {
    let d = dir(app_data);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let (_, file, bytes) = model(model_id);
    let script = format!(
        r#"$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$d = '{d}'
if (-not (Test-Path (Join-Path $d 'whisper-cli.exe'))) {{
  $zip = Join-Path $d 'whisper.zip'
  Invoke-WebRequest -UseBasicParsing -Uri '{bin}' -OutFile $zip
  $tmp = Join-Path $d 'unzip'
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  Get-ChildItem -Path $tmp -Recurse -Include *.exe,*.dll | Copy-Item -Destination $d -Force
  Remove-Item $tmp -Recurse -Force; Remove-Item $zip -Force
}}
$m = Join-Path $d '{file}'
if (-not (Test-Path $m) -or (Get-Item $m).Length -lt {min}) {{
  Invoke-WebRequest -UseBasicParsing -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{file}' -OutFile ($m + '.part')
  Move-Item ($m + '.part') $m -Force
}}
'ok'"#,
        d = d.to_string_lossy().replace('\'', "''"),
        bin = BIN_URL,
        file = file,
        min = bytes * 9 / 10,
    );
    let out = hidden(Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]))
        .output()
        .map_err(|e| format!("Couldn't start the download: {e}"))?;
    if !cli(app_data).exists() || !model_ready(app_data, model_id) {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "The download didn't finish. Check the internet connection and try again.{}",
            if err.trim().is_empty() { String::new() } else { format!(" ({})", err.lines().next().unwrap_or("").trim()) }
        ));
    }
    Ok(())
}

#[derive(Serialize)]
pub struct WhisperProgress {
    /// "program", "model" or "done"
    pub stage: &'static str,
    pub done: u64,
    pub total: u64,
}

/// How far the download has got (the files grow on disk while they download).
pub fn progress(app_data: &Path, model_id: &str) -> WhisperProgress {
    let d = dir(app_data);
    let (_, file, bytes) = model(model_id);
    let program = if cli(app_data).exists() { ZIP_BYTES } else { size(&d.join("whisper.zip")).min(ZIP_BYTES) };
    let got = if model_ready(app_data, model_id) { bytes } else { size(&d.join(format!("{file}.part"))).min(bytes) };
    let stage = if program < ZIP_BYTES { "program" } else if got < bytes { "model" } else { "done" };
    WhisperProgress { stage, done: program + got, total: ZIP_BYTES + bytes }
}

/* ───────────── The Whisper server: keeps the model loaded while listening ───────────── */

struct Server {
    child: Child,
    model: String,
}

static SERVER: Mutex<Option<Server>> = Mutex::new(None);

fn port_open() -> bool {
    TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_millis(200)).is_ok()
}

fn threads() -> String {
    std::thread::available_parallelism().map(|n| n.get().clamp(2, 6)).unwrap_or(4).to_string()
}

/// Starts (or keeps) the server with this model. Waits until it answers.
pub fn start_server(app_data: &Path, model_id: &str) -> Result<(), String> {
    {
        let mut guard = SERVER.lock().map_err(|e| e.to_string())?;
        if let Some(s) = guard.as_mut() {
            let alive = s.child.try_wait().map(|x| x.is_none()).unwrap_or(false);
            if alive && s.model == model_id {
                return Ok(());
            }
            let _ = s.child.kill();
            let _ = s.child.wait();
            *guard = None;
        }
        if !model_ready(app_data, model_id) {
            return Err("That speech model isn't downloaded yet.".into());
        }
        let exe = dir(app_data).join("whisper-server.exe");
        if !exe.exists() {
            return Err("whisper-server.exe is missing".into());
        }
        let (_, file, _) = model(model_id);
        let t = threads();
        let port = PORT.to_string();
        let child = hidden(
            Command::new(&exe)
                .current_dir(dir(app_data))
                .args(["-m", file, "-t", &t, "-l", "en", "--host", "127.0.0.1", "--port", &port, "-nt", "--prompt", PROMPT])
                // Speed: look at up to ~10 s of audio (not 30), greedy decoding, no slow retries.
                .args(FAST),
        )
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Whisper couldn't start: {e}"))?;
        *guard = Some(Server { child, model: model_id.to_string() });
    }
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(60) {
        if port_open() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    stop_server();
    Err("Whisper took too long to start.".into())
}

pub fn stop_server() {
    if let Ok(mut guard) = SERVER.lock() {
        if let Some(mut s) = guard.take() {
            let _ = s.child.kill();
            let _ = s.child.wait();
        }
    }
}

fn server_running() -> bool {
    SERVER
        .lock()
        .map(|mut g| g.as_mut().map(|s| s.child.try_wait().map(|x| x.is_none()).unwrap_or(false)).unwrap_or(false))
        .unwrap_or(false)
}

/// Sends one WAV to the server as a multipart form and returns the text.
fn post_to_server(wav: &[u8]) -> Result<String, String> {
    let boundary = format!("whq{}", uuid::Uuid::new_v4().simple());
    let mut body = Vec::with_capacity(wav.len() + 512);
    for (name, value) in [("response_format", "json"), ("temperature", "0.0")] {
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes());
    }
    body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n").as_bytes());
    body.extend_from_slice(wav);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let mut stream = TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_secs(2)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(60))).ok();
    let head = format!(
        "POST /inference HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nContent-Type: multipart/form-data; boundary={boundary}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(&body).map_err(|e| e.to_string())?;
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).map_err(|e| e.to_string())?;
    let resp = String::from_utf8_lossy(&resp);
    let (status_line, rest) = resp.split_once("\r\n").unwrap_or((&resp, ""));
    if !status_line.contains(" 200") {
        return Err(format!("Whisper server said: {status_line}"));
    }
    let json = rest.split_once("\r\n\r\n").map(|x| x.1).unwrap_or("");
    let v: serde_json::Value = serde_json::from_str(json.trim()).map_err(|e| format!("Whisper server answer: {e}"))?;
    Ok(v["text"].as_str().unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" "))
}

/// Turns one spoken sentence (16 kHz mono WAV) into text.
pub fn transcribe(app_data: &Path, model_id: &str, wav: &[u8]) -> Result<String, String> {
    if server_running() {
        if let Ok(text) = post_to_server(wav) {
            return Ok(text);
        }
    }
    // Fallback: the command-line tool (loads the model each time, so slower).
    let id = if model_ready(app_data, model_id) {
        model_id.to_string()
    } else {
        status(app_data).models.first().cloned().ok_or("Whisper isn't downloaded yet.")?
    };
    if !cli(app_data).exists() {
        return Err("Whisper isn't downloaded yet.".into());
    }
    let (_, file, _) = model(&id);
    let tmp = std::env::temp_dir().join(format!("whq-voice-{}.wav", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, wav).map_err(|e| e.to_string())?;
    let t = threads();
    let out = hidden(
        Command::new(cli(app_data))
            .current_dir(dir(app_data))
            .args(["-m", file, "-f"])
            .arg(&tmp)
            .args(["-nt", "-np", "-l", "en", "-t", &t, "--prompt", PROMPT])
            .args(FAST),
    )
    .output();
    let _ = std::fs::remove_file(&tmp);
    let out = out.map_err(|e| format!("Whisper couldn't run: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stdout).lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" "))
}
