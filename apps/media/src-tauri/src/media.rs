//! Pictures and videos. Imported files are copied into the app's own data folder,
//! so they keep working after a USB stick is unplugged.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct MediaFile {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub size: u64,
}

const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp"];
const VIDEO_EXT: &[&str] = &["mp4", "m4v", "webm", "mov", "ogv"];
const AUDIO_EXT: &[&str] = &["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "wma"];

pub fn media_dir(app_data: &Path) -> PathBuf {
    app_data.join("media")
}

pub fn import(app_data: &Path, paths: Vec<String>) -> Result<Vec<MediaFile>, String> {
    let dir = media_dir(app_data);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create the media folder: {e}"))?;

    let mut out = Vec::new();
    for p in paths {
        let src = PathBuf::from(&p);
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let kind = if IMAGE_EXT.contains(&ext.as_str()) {
            "image"
        } else if VIDEO_EXT.contains(&ext.as_str()) {
            "video"
        } else if AUDIO_EXT.contains(&ext.as_str()) {
            "audio"
        } else {
            continue; // not a picture or video
        };
        let name = src
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();
        let dest = dir.join(format!("{}.{}", uuid::Uuid::new_v4(), ext));
        std::fs::copy(&src, &dest).map_err(|e| format!("Couldn't copy {name}: {e}"))?;
        let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        out.push(MediaFile {
            path: dest.to_string_lossy().to_string(),
            name,
            kind: kind.to_string(),
            size,
        });
    }
    Ok(out)
}

pub fn delete(app_data: &Path, path: &str) -> Result<(), String> {
    // Only ever delete our own copies: the path must be inside the media folder, with no ".." in it.
    let norm = |p: &str| p.replace('/', "\\").trim_start_matches("\\?\\").to_lowercase();
    let dir = norm(&media_dir(app_data).to_string_lossy());
    let target = norm(path);
    if !target.starts_with(&format!("{dir}\\")) || target.contains("..") {
        return Err("That file isn't in the WorshipHQ media folder.".into());
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

const IMPORT_SCRIPT: &str = include_str!("import-slides.ps1");

/// Turns a PowerPoint or PDF into one picture per slide, saved in our media folder.
pub fn import_presentation(app_data: &Path, source: &str) -> Result<Vec<String>, String> {
    use std::process::Command;
    let out_dir = media_dir(app_data).join("presentations").join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let script = app_data.join("import-slides.ps1");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(IMPORT_SCRIPT.as_bytes());
    std::fs::write(&script, bytes).map_err(|e| e.to_string())?;

    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .arg(source)
        .arg(&out_dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let output = cmd.output().map_err(|e| format!("Couldn't start the importer: {e}"))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut slides = Vec::new();
    for line in text.lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line.trim()) else { continue };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("slide") => {
                if let Some(p) = v.get("path").and_then(|p| p.as_str()) {
                    slides.push(p.to_string());
                }
            }
            Some("error") => {
                return Err(v.get("message").and_then(|m| m.as_str()).unwrap_or("Import failed").to_string());
            }
            _ => {}
        }
    }
    if slides.is_empty() {
        let _ = std::fs::remove_dir_all(&out_dir);
        let err = String::from_utf8_lossy(&output.stderr);
        let detail = err.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
        return Err(if detail.is_empty() {
            "No slides were found in that file.".into()
        } else {
            format!("Couldn't import this file: {detail}")
        });
    }
    Ok(slides)
}
