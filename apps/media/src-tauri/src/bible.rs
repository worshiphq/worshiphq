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

/// Generate a demo KJV pack with sample verses for offline development.
pub fn ensure_demo_pack(app_data: &Path) -> Result<(), String> {
    let demo_path = pack_db_path(app_data, "kjv");
    if demo_path.exists() {
        return Ok(());
    }

    let db_path_str = demo_path.to_string_lossy().to_string();
    create_bible_db(&db_path_str)?;

    let conn = Connection::open(&demo_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO metadata (key, value) VALUES
            ('name', 'King James Version'),
            ('abbreviation', 'KJV'),
            ('language', 'English'),
            ('description', 'The King James Version (1769 Oxford Edition)');"
    ).map_err(|e| e.to_string())?;

    // Seed Genesis 1 and John 3 as sample data
    let sample_verses = vec![
        (1, 1, 1, "In the beginning God created the heaven and the earth."),
        (1, 1, 2, "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters."),
        (1, 1, 3, "And God said, Let there be light: and there was light."),
        (1, 1, 4, "And God saw the light, that it was good: and God divided the light from the darkness."),
        (1, 1, 5, "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day."),
        (1, 1, 6, "And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters."),
        (1, 1, 7, "And God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament: and it was so."),
        (1, 1, 8, "And God called the firmament Heaven. And the evening and the morning were the second day."),
        (1, 1, 9, "And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so."),
        (1, 1, 10, "And God called the dry land Earth; and the gathering together of the waters called he Seas: and God saw that it was good."),
        (1, 1, 11, "And God said, Let the earth bring forth grass, the herb yielding seed, and the fruit tree yielding fruit after his kind, whose seed is in itself, upon the earth: and it was so."),
        (1, 1, 12, "And the earth brought forth grass, and herb yielding seed after his kind, and the tree yielding fruit, whose seed was in itself, after his kind: and God saw that it was good."),
        (1, 1, 13, "And the evening and the morning were the third day."),
        (1, 1, 14, "And God said, Let there be lights in the firmament of the heaven to divide the day from the night; and let them be for signs, and for seasons, and for days, and years:"),
        (1, 1, 15, "And let them be for lights in the firmament of the heaven to give light upon the earth: and it was so."),
        (1, 1, 16, "And God made two great lights; the greater light to rule the day, and the lesser light to rule the night: he made the stars also."),
        (1, 1, 17, "And God set them in the firmament of the heaven to give light upon the earth,"),
        (1, 1, 18, "And to rule over the day and over the night, and to divide the light from the darkness: and God saw that it was good."),
        (1, 1, 19, "And the evening and the morning were the fourth day."),
        (1, 1, 20, "And God said, Let the waters bring forth abundantly the moving creature that hath life, and fowl that may fly above the earth in the open firmament of heaven."),
        (1, 1, 21, "And God created great whales, and every living creature that moveth, which the waters brought forth abundantly, after their kind, and every winged fowl after his kind: and God saw that it was good."),
        (1, 1, 22, "And God blessed them, saying, Be fruitful, and multiply, and fill the waters in the seas, and let fowl multiply in the earth."),
        (1, 1, 23, "And the evening and the morning were the fifth day."),
        (1, 1, 24, "And God said, Let the earth bring forth the living creature after his kind, cattle, and creeping thing, and beast of the earth after his kind: and it was so."),
        (1, 1, 25, "And God made the beast of the earth after his kind, and cattle after their kind, and every thing that creepeth upon the earth after his kind: and God saw that it was good."),
        (1, 1, 26, "And God said, Let us make man in our image, after our likeness: and let them have dominion over the fish of the sea, and over the fowl of the air, and over the cattle, and over all the earth, and over every creeping thing that creepeth upon the earth."),
        (1, 1, 27, "So God created man in his own image, in the image of God created he him; male and female created he them."),
        (1, 1, 28, "And God blessed them, and God said unto them, Be fruitful, and multiply, and replenish the earth, and subdue it: and have dominion over the fish of the sea, and over the fowl of the air, and over every living thing that moveth upon the earth."),
        (1, 1, 29, "And God said, Behold, I have given you every herb bearing seed, which is upon the face of all the earth, and every tree, in the which is the fruit of a tree yielding seed; to you it shall be for meat."),
        (1, 1, 30, "And to every beast of the earth, and to every fowl of the air, and to every thing that creepeth upon the earth, wherein there is life, I have given every green herb for meat: and it was so."),
        (1, 1, 31, "And God saw every thing that he had made, and, behold, it was very good. And the evening and the morning were the sixth day."),
        // John 3
        (43, 3, 1, "There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:"),
        (43, 3, 2, "The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God: for no man can do these miracles that thou doest, except God be with him."),
        (43, 3, 3, "Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God."),
        (43, 3, 4, "Nicodemus saith unto him, How can a man be born when he is old? can he enter the second time into his mother's womb, and be born?"),
        (43, 3, 5, "Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God."),
        (43, 3, 6, "That which is born of the flesh is flesh; and that which is born of the Spirit is spirit."),
        (43, 3, 7, "Marvel not that I said unto thee, Ye must be born again."),
        (43, 3, 8, "The wind bloweth where it listeth, and thou hearest the sound thereof, but canst not tell whence it cometh, and whither it goeth: so is every one that is born of the Spirit."),
        (43, 3, 9, "Nicodemus answered and said unto him, How can these things be?"),
        (43, 3, 10, "Jesus answered and said unto him, Art thou a master of Israel, and knowest not these things?"),
        (43, 3, 11, "Verily, verily, I say unto thee, We speak that we do know, and testify that we have seen; and ye receive not our witness."),
        (43, 3, 12, "If I have told you earthly things, and ye believe not, how shall ye believe, if I tell you of heavenly things?"),
        (43, 3, 13, "And no man hath ascended up to heaven, but he that came down from heaven, even the Son of man which is in heaven."),
        (43, 3, 14, "And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:"),
        (43, 3, 15, "That whosoever believeth in him should not perish, but have eternal life."),
        (43, 3, 16, "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
        (43, 3, 17, "For God sent not his Son into the world to condemn the world; but that the world through him might be saved."),
        (43, 3, 18, "He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God."),
        (43, 3, 19, "And this is the condemnation, that light is come into the world, and men loved darkness rather than light, because their deeds were evil."),
        (43, 3, 20, "For every one that doeth evil hateth the light, neither cometh to the light, lest his deeds should be reproved."),
        (43, 3, 21, "But he that doeth truth cometh to the light, that his deeds may be made manifest, that they are wrought in God."),
        // Psalm 23
        (19, 23, 1, "The LORD is my shepherd; I shall not want."),
        (19, 23, 2, "He maketh me to lie down in green pastures: he leadeth me beside the still waters."),
        (19, 23, 3, "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."),
        (19, 23, 4, "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me."),
        (19, 23, 5, "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over."),
        (19, 23, 6, "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever."),
        // Psalm 1
        (19, 1, 1, "Blessed is the man that walketh not in the counsel of the ungodly, nor standeth in the way of sinners, nor sitteth in the seat of the scornful."),
        (19, 1, 2, "But his delight is in the law of the LORD; and in his law doth he meditate day and night."),
        (19, 1, 3, "And he shall be like a tree planted by the rivers of water, that bringeth forth his fruit in his season; his leaf also shall not wither; and whatsoever he doeth shall prosper."),
        (19, 1, 4, "The ungodly are not so: but are like the chaff which the wind driveth away."),
        (19, 1, 5, "Therefore the ungodly shall not stand in the judgment, nor sinners in the congregation of the righteous."),
        (19, 1, 6, "For the LORD knoweth the way of the righteous: but the way of the ungodly shall perish."),
        // Romans 8
        (45, 8, 1, "There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit."),
        (45, 8, 2, "For the law of the Spirit of life in Christ Jesus hath made me free from the law of sin and death."),
        (45, 8, 28, "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."),
        (45, 8, 31, "What shall we then say to these things? If God be for us, who can be against us?"),
        (45, 8, 37, "Nay, in all these things we are more than conquerors through him that loved us."),
        (45, 8, 38, "For I am persuaded, that neither death, nor life, nor angels, nor principalities, nor powers, nor things present, nor things to come,"),
        (45, 8, 39, "Nor height, nor depth, nor any other creature, shall be able to separate us from the love of God, which is in Christ Jesus our Lord."),
    ];

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare("INSERT INTO verses (book, chapter, verse, text) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| e.to_string())?;

        for (book, chapter, verse, text) in &sample_verses {
            stmt.execute(rusqlite::params![book, chapter, verse, text])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}
