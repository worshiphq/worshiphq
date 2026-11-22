//! Importing songs from other software, reading song files, and opening Windows sound settings.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct ImportedSong {
    pub title: String,
    pub author: String,
    pub copyright: String,
    /// The words as EasyWorship stored them (RTF). The app turns this into plain text.
    pub words: String,
}

#[derive(Debug, Serialize)]
pub struct TextFile {
    pub name: String,
    pub text: String,
}

/// EasyWorship 6/7 keep their songs here.
pub fn find_easyworship() -> Option<String> {
    let public = std::env::var("PUBLIC").unwrap_or_else(|_| "C:\\Users\\Public".into());
    let candidates = [
        PathBuf::from(&public).join("Documents\\Softouch\\EasyWorship\\Default\\v6.1\\Databases\\Data"),
        PathBuf::from(&public).join("Documents\\Softouch\\EasyWorship\\Default\\Databases\\Data"),
    ];
    candidates
        .into_iter()
        .find(|p| p.join("Songs.db").exists() && p.join("SongWords.db").exists())
        .map(|p| p.to_string_lossy().to_string())
}

/// Reads songs from an EasyWorship 6/7 database folder (read-only; EasyWorship is not changed).
pub fn import_easyworship(folder: &str) -> Result<Vec<ImportedSong>, String> {
    let dir = Path::new(folder);
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let songs = Connection::open_with_flags(dir.join("Songs.db"), flags)
        .map_err(|e| format!("Couldn't open EasyWorship's Songs.db: {e}"))?;
    let words = Connection::open_with_flags(dir.join("SongWords.db"), flags)
        .map_err(|e| format!("Couldn't open EasyWorship's SongWords.db: {e}"))?;

    let mut stmt = songs
        .prepare("SELECT rowid, COALESCE(title,''), COALESCE(author,''), COALESCE(copyright,'') FROM song")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut wstmt = words
        .prepare("SELECT words FROM word WHERE song_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(rows.len());
    for (id, title, author, copyright) in rows {
        let w: String = wstmt.query_row([id], |r| r.get(0)).unwrap_or_default();
        if title.trim().is_empty() && w.is_empty() {
            continue;
        }
        out.push(ImportedSong { title, author, copyright, words: w });
    }
    Ok(out)
}

pub fn read_text_files(paths: Vec<String>) -> Result<Vec<TextFile>, String> {
    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        let bytes = std::fs::read(&path).map_err(|e| format!("Couldn't read {p}: {e}"))?;
        // Song files are usually UTF-8, sometimes UTF-16 (Windows) or Windows-1252.
        let text = if bytes.starts_with(&[0xFF, 0xFE]) {
            let u: Vec<u16> = bytes[2..].chunks(2).map(|c| u16::from_le_bytes([c[0], *c.get(1).unwrap_or(&0)])).collect();
            String::from_utf16_lossy(&u)
        } else {
            match String::from_utf8(bytes.clone()) {
                Ok(s) => s.trim_start_matches('\u{feff}').to_string(),
                Err(_) => bytes.iter().map(|&b| b as char).collect(),
            }
        };
        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Song").to_string();
        out.push(TextFile { name, text });
    }
    Ok(out)
}

pub fn open_sound_settings() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:sound"])
            .creation_flags(0x0800_0000)
            .spawn();
    }
}

/// The names of all fonts installed on this computer (for the font pickers).
pub fn list_fonts() -> Vec<String> {
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let Ok(out) = cmd.output() else { return vec![] };
    let mut names: Vec<String> = String::from_utf8_lossy(&out.stdout).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
}
