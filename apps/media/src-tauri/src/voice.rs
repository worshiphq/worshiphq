//! Voice assistant: listens to the microphone and reports Bible references it hears.
//!
//! Uses the speech recognizer built into Windows (System.Speech), run by a small
//! PowerShell script. It works offline and needs no downloads. Each line the script
//! prints is a JSON message that is forwarded to the app as a "voice-event".

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

const SCRIPT: &str = include_str!("voice-listener.ps1");

#[derive(Default)]
pub struct VoiceState(pub Mutex<Option<Child>>);

pub fn start(app: &AppHandle, state: &VoiceState) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "voice state poisoned")?;
    if let Some(child) = guard.as_mut() {
        // Still running? Then there's nothing to do.
        if matches!(child.try_wait(), Ok(None)) {
            return Ok(());
        }
    }

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let script = dir.join("voice-listener.ps1");
    // Write with a BOM so Windows PowerShell reads it as UTF-8.
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(SCRIPT.as_bytes());
    std::fs::write(&script, bytes).map_err(|e| e.to_string())?;

    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console pops up
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Couldn't start the voice listener: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let line = line.trim().to_string();
                if line.starts_with('{') {
                    let _ = app.emit("voice-event", line);
                }
            }
            let _ = app.emit("voice-event", r#"{"type":"stopped"}"#.to_string());
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                let msg = serde_json::json!({ "type": "log", "message": line });
                let _ = app.emit("voice-event", msg.to_string());
            }
        });
    }

    *guard = Some(child);
    Ok(())
}

pub fn stop(state: &VoiceState) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
