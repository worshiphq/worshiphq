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

fn easyworship_root() -> PathBuf {
    let public = std::env::var("PUBLIC").unwrap_or_else(|_| "C:\\Users\\Public".into());
    PathBuf::from(public).join("Documents\\Softouch\\EasyWorship")
}

fn has_songs(dir: &Path) -> bool {
    // Windows sees Songs.db and Songs.DB as one name: SongWords.db is only there in EasyWorship 6/7.
    dir.join("Songs.db").exists() && (dir.join("SongWords.db").exists() || dir.join("Songs.MB").exists())
}

/// EasyWorship keeps its songs here (6/7 first, then 2009).
pub fn find_easyworship() -> Option<String> {
    let root = easyworship_root().join("Default");
    [root.join("v6.1\\Databases\\Data"), root.join("Databases\\Data")]
        .into_iter()
        .find(|p| has_songs(p))
        .map(|p| p.to_string_lossy().to_string())
}

#[derive(Debug, Serialize)]
pub struct ImportSource {
    /// "easyworship" | "openlp" | "files"
    pub kind: String,
    pub name: String,
    pub path: String,
    /// Pictures, videos and sound that belong to it.
    pub media: Vec<String>,
    /// Song files ("files" only).
    pub files: Vec<String>,
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>, ext: &[&str]) {
    if depth == 0 || out.len() >= 5000 {
        return;
    }
    let Ok(list) = std::fs::read_dir(dir) else { return };
    for e in list.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk(&p, depth - 1, out, ext);
        } else {
            let x = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            if ext.contains(&x.as_str()) {
                out.push(p);
            }
        }
    }
}
const SONG_FILES: &[&str] = &["show", "pro", "pro6", "pro5", "xml", "cho", "crd", "chopro", "chordpro", "sng", "usr", "txt", "vpagd", "json"];
const MEDIA_FILES: &[&str] = &["jpg", "jpeg", "png", "bmp", "gif", "webp", "mp4", "m4v", "mov", "webm", "mp3", "wav", "m4a"];
fn strings(v: Vec<PathBuf>) -> Vec<String> {
    v.into_iter().map(|p| p.to_string_lossy().to_string()).collect()
}

/// Song files in a folder the user chose (and the folders in it).
pub fn song_files_in(folder: &str) -> Vec<String> {
    let mut out = Vec::new();
    walk(Path::new(folder), 5, &mut out, SONG_FILES);
    // OpenSong songs have no extension.
    if out.is_empty() {
        walk(Path::new(folder), 3, &mut out, &[""]);
    }
    strings(out)
}

/// Other church software on this computer, with what can be brought over.
pub fn find_import_sources() -> Vec<ImportSource> {
    let mut out: Vec<ImportSource> = Vec::new();
    // Every EasyWorship profile ("Default" and any others).
    if let Ok(profiles) = std::fs::read_dir(easyworship_root()) {
        for p in profiles.flatten().map(|e| e.path()).filter(|p| p.is_dir()) {
            let profile = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let mut found = Vec::new();
            for f in ["Images", "Videos", "Audio"] {
                walk(&p.join("Resources").join(f), 3, &mut found, MEDIA_FILES);
            }
            let mut media = strings(found);
            for (data, version) in [(p.join("v6.1\\Databases\\Data"), "6/7"), (p.join("Databases\\Data"), "2009")] {
                if !has_songs(&data) {
                    continue;
                }
                let label = if profile == "Default" { String::new() } else { format!(" ({profile})") };
                out.push(ImportSource { kind: "easyworship".into(), name: format!("EasyWorship {version}{label}"), path: data.to_string_lossy().into(), media: std::mem::take(&mut media), files: vec![] });
            }
        }
    }
    if let Ok(app) = std::env::var("APPDATA") {
        let db = PathBuf::from(app).join("openlp\\data\\songs\\songs.sqlite");
        if db.exists() {
            out.push(ImportSource { kind: "openlp".into(), name: "OpenLP".into(), path: db.to_string_lossy().into(), media: vec![], files: vec![] });
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        for (name, dir) in [("FreeShow", "FreeShow\\Shows"), ("ProPresenter 7", "ProPresenter\\Libraries"), ("ProPresenter 6", "ProPresenter6"), ("OpenSong", "OpenSong\\Songs"), ("VideoPsalm", "VideoPsalm")] {
            let p = PathBuf::from(&home).join("Documents").join(dir);
            if !p.is_dir() {
                continue;
            }
            let files = song_files_in(&p.to_string_lossy());
            if !files.is_empty() {
                out.push(ImportSource { kind: "files".into(), name: name.into(), path: p.to_string_lossy().into(), media: vec![], files });
            }
        }
    }
    out
}

/// OpenLP's songs (its words are XML, which the app reads).
pub fn import_openlp(path: &str) -> Result<Vec<ImportedSong>, String> {
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| format!("Couldn't open OpenLP's songs: {e}"))?;
    let mut stmt = db
        .prepare("SELECT s.title, COALESCE((SELECT group_concat(a.display_name, ', ') FROM authors_songs x JOIN authors a ON a.id = x.author_id WHERE x.song_id = s.id), ''), COALESCE(s.copyright,''), COALESCE(s.lyrics,'') FROM songs s")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(ImportedSong { title: r.get(0)?, author: r.get(1)?, copyright: r.get(2)?, words: r.get(3)? }))
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(Result::ok).collect())
}

/// Reads songs from an EasyWorship database folder, 2009 or 6/7 (read-only; EasyWorship is not changed).
pub fn import_easyworship(folder: &str) -> Result<Vec<ImportedSong>, String> {
    let dir = Path::new(folder);
    if !dir.join("SongWords.db").exists() {
        let field = |r: &std::collections::HashMap<String, String>, n: &str| r.get(n).cloned().unwrap_or_default();
        return Ok(crate::paradox::read_table(&dir.join("Songs.DB"))?
            .iter()
            .map(|r| ImportedSong { title: field(r, "Title"), author: field(r, "Author"), copyright: field(r, "Copyright"), words: field(r, "Words") })
            .filter(|s| !s.title.trim().is_empty() || !s.words.is_empty())
            .collect());
    }
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

/// Saves text to a file the user chose (e.g. a schedule).
pub fn write_text_file(path: &str, text: &str) -> Result<(), String> {
    std::fs::write(path, text).map_err(|e| format!("Couldn't save the file: {e}"))
}

/// Remote control for Stream Deck (Bitfocus Companion "HTTP request"), Elgato's own website buttons, AutoHotkey…
/// Only this computer can reach it (127.0.0.1). GET http://127.0.0.1:18300/action/next → the app does "next".
pub fn start_remote_server<F: Fn(String) + Send + 'static>(on_action: F) {
    std::thread::spawn(move || {
        let Ok(listener) = std::net::TcpListener::bind(("127.0.0.1", 18300)) else { return };
        for stream in listener.incoming().flatten() {
            use std::io::{Read, Write};
            let mut stream = stream;
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(800)));
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            let path = req.split_whitespace().nth(1).unwrap_or("/");
            let action: String = path
                .trim_start_matches('/')
                .trim_start_matches("action/")
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
                .take(40)
                .collect();
            let (status, body) = if action.is_empty() {
                ("200 OK", "WorshipHQ Live remote. Try /action/next, /action/previous, /action/send, /action/black, /action/clear, /action/logo".to_string())
            } else {
                on_action(action.clone());
                ("200 OK", format!("{{\"ok\":true,\"action\":\"{action}\"}}"))
            };
            let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        }
    });
}
