//! Whisper speech recognition (OpenAI Whisper via whisper.cpp, MIT licence): free, offline and far more
//! accurate than the old Windows recogniser. Downloaded once into the app's data folder on request.
//! The app records the microphone itself and sends each spoken sentence here as a 16 kHz WAV.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

const BIN_URL: &str = "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const MODEL_FILE: &str = "ggml-base.en.bin";

/// Words Whisper should expect, so Bible books are spelled right.
const PROMPT: &str = "Turn with me to John chapter 3 verse 16. Genesis, Exodus, Psalm, Proverbs, Isaiah, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, Hebrews, James, 1 Peter, 1 John, Revelation.";

#[derive(Serialize)]
pub struct WhisperStatus {
    pub installed: bool,
    pub folder: String,
}

fn dir(app_data: &Path) -> PathBuf {
    app_data.join("whisper")
}

fn cli(app_data: &Path) -> PathBuf {
    dir(app_data).join("whisper-cli.exe")
}

pub fn status(app_data: &Path) -> WhisperStatus {
    WhisperStatus {
        installed: cli(app_data).exists() && dir(app_data).join(MODEL_FILE).exists(),
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

/// Downloads the Whisper program (about 8 MB) and the English speech model (about 148 MB).
pub fn install(app_data: &Path) -> Result<(), String> {
    let d = dir(app_data);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
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
$m = Join-Path $d '{model}'
if (-not (Test-Path $m) -or (Get-Item $m).Length -lt 100000000) {{
  Invoke-WebRequest -UseBasicParsing -Uri '{model_url}' -OutFile ($m + '.part')
  Move-Item ($m + '.part') $m -Force
}}
'ok'"#,
        d = d.to_string_lossy().replace('\'', "''"),
        bin = BIN_URL,
        model = MODEL_FILE,
        model_url = MODEL_URL,
    );
    let out = hidden(Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]))
        .output()
        .map_err(|e| format!("Couldn't start the download: {e}"))?;
    if !status(app_data).installed {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "The download didn't finish. Check the internet connection and try again.{}",
            if err.trim().is_empty() { String::new() } else { format!(" ({})", err.lines().next().unwrap_or("").trim()) }
        ));
    }
    Ok(())
}

/// Turns one spoken sentence (16 kHz mono WAV) into text.
pub fn transcribe(app_data: &Path, wav: &[u8]) -> Result<String, String> {
    if !status(app_data).installed {
        return Err("Whisper isn't downloaded yet.".into());
    }
    let tmp = std::env::temp_dir().join(format!("whq-voice-{}.wav", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, wav).map_err(|e| e.to_string())?;
    let threads = std::thread::available_parallelism().map(|n| n.get().clamp(2, 8)).unwrap_or(4).to_string();
    let out = hidden(
        Command::new(cli(app_data))
            .current_dir(dir(app_data))
            .args(["-m", MODEL_FILE, "-f"])
            .arg(&tmp)
            .args(["-nt", "-np", "-l", "en", "-t", &threads, "--prompt", PROMPT]),
    )
    .output();
    let _ = std::fs::remove_file(&tmp);
    let out = out.map_err(|e| format!("Whisper couldn't run: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Ok(text)
}

const ZIP_BYTES: u64 = 8_573_270;
const MODEL_BYTES: u64 = 147_964_211;

#[derive(Serialize)]
pub struct WhisperProgress {
    /// "program", "model" or "done"
    pub stage: &'static str,
    pub done: u64,
    pub total: u64,
}

fn size(p: &Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

/// How far the download has got (the files grow on disk while they download).
pub fn progress(app_data: &Path) -> WhisperProgress {
    let d = dir(app_data);
    let program = if cli(app_data).exists() { ZIP_BYTES } else { size(&d.join("whisper.zip")).min(ZIP_BYTES) };
    let model_path = d.join(MODEL_FILE);
    let model = if model_path.exists() && size(&model_path) > 100_000_000 { MODEL_BYTES } else { size(&d.join(format!("{MODEL_FILE}.part"))).min(MODEL_BYTES) };
    let stage = if program < ZIP_BYTES { "program" } else if model < MODEL_BYTES { "model" } else { "done" };
    WhisperProgress { stage, done: program + model, total: ZIP_BYTES + MODEL_BYTES }
}
