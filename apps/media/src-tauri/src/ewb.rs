//! Import Bibles a church already owns in EasyWorship (.ewb files) for use on the same computer.
//! The file holds a short id ("ezPaidNKJV") followed by one zlib-compressed block per book,
//! each written as "chapter:verse text" paragraphs. Nothing is uploaded or shared.

use crate::bible::BiblePack;
use flate2::read::ZlibDecoder;
use rusqlite::Connection;
use std::io::Read;
use std::path::{Path, PathBuf};

pub fn easyworship_bible_folder() -> Option<PathBuf> {
    let base = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into());
    let p = PathBuf::from(base).join("Softouch\\EasyWorship\\Plugins\\Bibles");
    p.exists().then_some(p)
}

pub fn list_easyworship_bibles() -> Vec<String> {
    let Some(dir) = easyworship_bible_folder() else { return vec![] };
    let mut out: Vec<String> = std::fs::read_dir(dir)
        .map(|it| {
            it.flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("ewb")))
                .map(|p| p.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

/// Windows-1252 → text (EasyWorship files are not UTF-8).
fn decode_1252(bytes: &[u8]) -> String {
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
        '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
    ];
    bytes
        .iter()
        .map(|&b| if (0x80..0xA0).contains(&b) { HIGH[(b - 0x80) as usize] } else { b as char })
        .collect()
}

/// Every zlib block in the file, in order.
fn blocks(data: &[u8]) -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos + 2 < data.len() {
        let b0 = data[pos];
        let b1 = data[pos + 1];
        let header = b0 == 0x78 && matches!(b1, 0x01 | 0x5e | 0x9c | 0xda);
        if header {
            let mut dec = ZlibDecoder::new(&data[pos..]);
            let mut buf = Vec::new();
            if dec.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                let used = dec.total_in() as usize;
                out.push(buf);
                pos += used.max(2);
                continue;
            }
        }
        pos += 1;
    }
    out
}

fn known_name(abbr: &str) -> (&'static str, &'static str) {
    match abbr {
        "NKJV" => ("New King James Version", "English"),
        "NIV" | "NIVA" => ("New International Version", "English"),
        "ESV" => ("English Standard Version", "English"),
        "AMP" => ("Amplified Bible", "English"),
        "NLT" => ("New Living Translation", "English"),
        "NASB" => ("New American Standard Bible", "English"),
        "MSG" => ("The Message", "English"),
        "NRSV" => ("New Revised Standard Version", "English"),
        "RSV" => ("Revised Standard Version", "English"),
        "GNT" => ("Good News Translation", "English"),
        "HCSB" => ("Holman Christian Standard Bible", "English"),
        "KJV" => ("King James Version", "English"),
        "ASV" => ("American Standard Version", "English"),
        "LBLA" => ("La Biblia de las Américas", "Spanish"),
        "NBLH" => ("Nueva Biblia Latinoamericana de Hoy", "Spanish"),
        "NVI" => ("Nueva Versión Internacional", "Spanish"),
        "RVR" => ("Reina-Valera 1960", "Spanish"),
        "RVA" => ("Reina-Valera Antigua", "Spanish"),
        "NVI-P" => ("Nova Versão Internacional", "Portuguese"),
        "NBG51" => ("NBG-vertaling 1951", "Dutch"),
        "NBV" => ("Nieuwe Bijbelvertaling", "Dutch"),
        "NB88-BM" => ("Norsk Bibel 88 (bokmål)", "Norwegian"),
        "NB88-NN" => ("Norsk Bibel 88 (nynorsk)", "Norwegian"),
        "BIBEL2000" => ("Bibel 2000", "Swedish"),
        _ => ("", "English"),
    }
}

pub fn import_ewb(app_data: &Path, source: &str) -> Result<BiblePack, String> {
    let data = std::fs::read(source).map_err(|e| format!("Couldn't read the Bible file: {e}"))?;
    if !data.starts_with(b"EasyWorship Bible Text") {
        return Err("That isn't an EasyWorship Bible file (.ewb).".into());
    }
    let blocks = blocks(&data);
    if blocks.len() < 67 {
        return Err(format!("This Bible file looks incomplete ({} books found).", blocks.len().saturating_sub(1)));
    }
    let stem = Path::new(source).file_stem().and_then(|s| s.to_str()).unwrap_or("bible").to_lowercase();
    let abbr = stem.to_uppercase();
    let (name, language) = known_name(&abbr);
    let name = if name.is_empty() { abbr.clone() } else { name.to_string() };
    let id = format!("ew-{stem}");

    let dir = app_data.join("bibles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join(format!("{id}.db"));
    let _ = std::fs::remove_file(&db_path);
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE verses (id INTEGER PRIMARY KEY AUTOINCREMENT, book INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL, text TEXT NOT NULL);",
    )
    .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut count = 0u32;
    {
        let mut ins = tx
            .prepare("INSERT INTO verses (book, chapter, verse, text) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| e.to_string())?;
        for (i, block) in blocks.iter().skip(1).take(66).enumerate() {
            let book = (i + 1) as u32;
            let text = decode_1252(block).replace("\r\n", "\n");
            for para in text.split("\n\n") {
                let para = para.trim();
                let Some((cv, rest)) = para.split_once(' ') else { continue };
                let Some((c, v)) = cv.split_once(':') else { continue };
                let (Ok(c), Ok(v)) = (c.parse::<u32>(), v.parse::<u32>()) else { continue };
                let words = rest.split_whitespace().collect::<Vec<_>>().join(" ");
                if words.is_empty() {
                    continue;
                }
                ins.execute(rusqlite::params![book, c, v, words]).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    conn.execute_batch("CREATE INDEX idx_bcv ON verses(book, chapter, verse); CREATE INDEX idx_text ON verses(text);")
        .map_err(|e| e.to_string())?;
    let description = "Imported from EasyWorship on this computer. For use on this computer only.";
    for (k, v) in [("name", name.as_str()), ("abbreviation", abbr.as_str()), ("language", language), ("description", description)] {
        conn.execute("INSERT INTO metadata (key, value) VALUES (?1, ?2)", [k, v]).map_err(|e| e.to_string())?;
    }
    drop(conn);

    Ok(BiblePack {
        id,
        name,
        abbreviation: abbr,
        language: language.to_string(),
        description: description.to_string(),
        verse_count: count,
        file_size: std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0),
    })
}
