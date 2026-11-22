//! WorshipHQ stock backgrounds: a starter set of pictures ships inside the installer, and more pictures and
//! motion loops download from the WorshipHQ server into the media folder.

use crate::media::{media_dir, MediaFile};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct BundledStock {
    pub id: String,
    pub title: String,
    pub category: String,
    pub path: String,
    pub thumb: String,
}

/// The pictures that came with the installer (resources/stock/manifest.json + *.jpg).
pub fn bundled(resource_dir: &Path) -> Vec<BundledStock> {
    let dir = resource_dir.join("stock");
    let Ok(text) = std::fs::read_to_string(dir.join("manifest.json")) else { return vec![] };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
    v["items"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|i| {
                    let id = i["id"].as_str()?.to_string();
                    let path = dir.join(format!("{id}.jpg"));
                    let thumb = dir.join(format!("{id}.thumb.jpg"));
                    let thumb = if thumb.exists() { thumb } else { path.clone() };
                    path.exists().then(|| BundledStock {
                        thumb: thumb.to_string_lossy().to_string(),
                        title: i["title"].as_str().unwrap_or(&id).to_string(),
                        category: i["category"].as_str().unwrap_or("Backgrounds").to_string(),
                        path: path.to_string_lossy().to_string(),
                        id,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn part_path(app_data: &Path, token: &str, ext: &str) -> std::path::PathBuf {
    media_dir(app_data).join(format!("{token}.{ext}.part"))
}

fn clean(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(64).collect()
}

/// Downloads one background into the media folder. `token` names the file so the app can follow the progress.
pub fn download(app_data: &Path, url: &str, ext: &str, token: &str, title: &str, kind: &str) -> Result<MediaFile, String> {
    if !url.starts_with("https://") {
        return Err("Bad download link.".into());
    }
    let (ext, token) = (clean(ext), clean(token));
    let dir = media_dir(app_data);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let part = part_path(app_data, &token, &ext);
    let dest = dir.join(format!("{token}.{ext}"));
    let script = format!(
        "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile '{}'",
        url.replace('\'', "''"),
        part.to_string_lossy().replace('\'', "''")
    );
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| format!("Couldn't start the download: {e}"))?;
    if !out.status.success() || !part.exists() {
        let _ = std::fs::remove_file(&part);
        return Err("The download didn't finish. Check the internet connection and try again.".into());
    }
    std::fs::rename(&part, &dest).map_err(|e| e.to_string())?;
    Ok(MediaFile {
        size: std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0),
        path: dest.to_string_lossy().to_string(),
        name: title.to_string(),
        kind: if kind == "video" { "video".into() } else { "image".into() },
    })
}

/// Bytes downloaded so far for a download started with `token`.
pub fn progress(app_data: &Path, token: &str, ext: &str) -> u64 {
    let (ext, token) = (clean(ext), clean(token));
    let part = part_path(app_data, &token, &ext);
    std::fs::metadata(&part)
        .map(|m| m.len())
        .or_else(|_| std::fs::metadata(media_dir(app_data).join(format!("{token}.{ext}"))).map(|m| m.len()))
        .unwrap_or(0)
}
