use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Verse {
    pub book: u32,
    pub chapter: u32,
    pub verse: u32,
    pub text: String,
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

pub fn create_bible_db(db_path: &str) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bcv ON verses(book, chapter, verse);",
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
