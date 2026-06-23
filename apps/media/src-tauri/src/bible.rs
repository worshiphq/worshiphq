use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verse {
    pub book: u32,
    pub chapter: u32,
    pub verse: u32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiblePack {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    pub description: String,
    pub verse_count: u32,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookInfo {
    pub index: u32,
    pub name: String,
    pub chapters: u32,
}

fn packs_dir(app_data: &Path) -> PathBuf {
    let dir = app_data.join("bibles");
    fs::create_dir_all(&dir).ok();
    dir
}

fn pack_db_path(app_data: &Path, pack_id: &str) -> PathBuf {
    packs_dir(app_data).join(format!("{}.db", pack_id))
}

pub fn get_verses(
    db_path: &str,
    book: u32,
    chapter: u32,
    verse_start: u32,
    verse_end: u32,
) -> Result<Vec<Verse>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT book, chapter, verse, text FROM verses \
             WHERE book = ?1 AND chapter = ?2 AND verse >= ?3 AND verse <= ?4 \
             ORDER BY verse",
        )
        .map_err(|e| e.to_string())?;

    let verses = stmt
        .query_map(
            rusqlite::params![book, chapter, verse_start, verse_end],
            |row| {
                Ok(Verse {
                    book: row.get(0)?,
                    chapter: row.get(1)?,
                    verse: row.get(2)?,
                    text: row.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(verses)
}

pub fn get_chapter_verses(
    db_path: &str,
    book: u32,
    chapter: u32,
) -> Result<Vec<Verse>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT book, chapter, verse, text FROM verses \
             WHERE book = ?1 AND chapter = ?2 \
             ORDER BY verse",
        )
        .map_err(|e| e.to_string())?;

    let verses = stmt
        .query_map(rusqlite::params![book, chapter], |row| {
            Ok(Verse {
                book: row.get(0)?,
                chapter: row.get(1)?,
                verse: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(verses)
}

pub fn search_text(db_path: &str, query: &str) -> Result<Vec<Verse>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let search_term = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT book, chapter, verse, text FROM verses \
             WHERE text LIKE ?1 \
             ORDER BY book, chapter, verse \
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let verses = stmt
        .query_map(rusqlite::params![search_term], |row| {
            Ok(Verse {
                book: row.get(0)?,
                chapter: row.get(1)?,
                verse: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(verses)
}

pub fn get_chapter_count(db_path: &str, book: u32) -> Result<u32, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let count: u32 = conn
        .query_row(
            "SELECT MAX(chapter) FROM verses WHERE book = ?1",
            rusqlite::params![book],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count)
}

pub fn get_verse_count_for_chapter(db_path: &str, book: u32, chapter: u32) -> Result<u32, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let count: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM verses WHERE book = ?1 AND chapter = ?2",
            rusqlite::params![book, chapter],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count)
}

pub fn list_packs(app_data: &Path) -> Result<Vec<BiblePack>, String> {
    let dir = packs_dir(app_data);
    let mut packs = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "db") {
            if let Ok(pack) = read_pack_metadata(&path) {
                packs.push(pack);
            }
        }
    }

    packs.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(packs)
}

fn read_pack_metadata(db_path: &Path) -> Result<BiblePack, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let has_meta: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='metadata'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    let file_size = fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    let id = db_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    if has_meta {
        let name: String = conn
            .query_row("SELECT value FROM metadata WHERE key='name'", [], |r| r.get(0))
            .unwrap_or_else(|_| id.clone());
        let abbreviation: String = conn
            .query_row("SELECT value FROM metadata WHERE key='abbreviation'", [], |r| r.get(0))
            .unwrap_or_else(|_| id.to_uppercase());
        let language: String = conn
            .query_row("SELECT value FROM metadata WHERE key='language'", [], |r| r.get(0))
            .unwrap_or_else(|_| "English".to_string());
        let description: String = conn
            .query_row("SELECT value FROM metadata WHERE key='description'", [], |r| r.get(0))
            .unwrap_or_default();
        let verse_count: u32 = conn
            .query_row("SELECT COUNT(*) FROM verses", [], |r| r.get(0))
            .unwrap_or(0);

        Ok(BiblePack {
            id,
            name,
            abbreviation,
            language,
            description,
            verse_count,
            file_size,
        })
    } else {
        let verse_count: u32 = conn
            .query_row("SELECT COUNT(*) FROM verses", [], |r| r.get(0))
            .unwrap_or(0);

        Ok(BiblePack {
            id: id.clone(),
            name: id.clone(),
            abbreviation: id.to_uppercase(),
            language: "English".to_string(),
            description: String::new(),
            verse_count,
            file_size,
        })
    }
}

pub fn import_pack(app_data: &Path, source_path: &str, pack_id: &str) -> Result<BiblePack, String> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err("Source file not found".to_string());
    }

    // Validate it's a valid Bible SQLite DB
    let conn = Connection::open(source).map_err(|e| format!("Invalid Bible pack: {}", e))?;
    let has_verses: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='verses'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !has_verses {
        return Err("Invalid Bible pack: missing 'verses' table".to_string());
    }
    drop(conn);

    let dest = pack_db_path(app_data, pack_id);
    fs::copy(source, &dest).map_err(|e| format!("Failed to copy pack: {}", e))?;

    read_pack_metadata(&dest)
}

pub fn delete_pack(app_data: &Path, pack_id: &str) -> Result<(), String> {
    let path = pack_db_path(app_data, pack_id);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn create_bible_db(db_path: &str) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bcv ON verses(book, chapter, verse);
        CREATE INDEX IF NOT EXISTS idx_text ON verses(text);",
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Copy bundled Bible packs from app resources to the data directory on first launch.
pub fn install_bundled_packs(app_data: &Path, resource_dir: &Path) -> Result<(), String> {
    let dest_dir = packs_dir(app_data);

    let bibles_dir = resource_dir.join("bibles");
    if !bibles_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(&bibles_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let src = entry.path();
        if src.extension().is_some_and(|e| e == "db") {
            let name = src.file_name().unwrap();
            let dest = dest_dir.join(name);
            if !dest.exists() {
                fs::copy(&src, &dest)
                    .map_err(|e| format!("Failed to install {}: {}", name.to_string_lossy(), e))?;
                eprintln!("[bible] installed bundled pack: {}", name.to_string_lossy());
            }
        }
    }

    Ok(())
}
