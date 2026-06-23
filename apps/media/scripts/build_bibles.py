#!/usr/bin/env python3
"""
Build full Bible SQLite databases from public domain sources.

Sources:
  - thiagobodruk/bible (GitHub) — JSON format for KJV, BBE
  - gratis-bible/bible (GitHub) — OSIS XML format for ASV, WEB, YLT
  - Manual Twi key verses as placeholder

Each .db has:
  - metadata table: key/value (name, abbreviation, language, description)
  - verses table: (id, book, chapter, verse, text) with indices

Usage:
    python build_bibles.py              # Build all
    python build_bibles.py kjv          # Build one
    python build_bibles.py kjv asv web  # Build specific
"""

import json
import os
import re
import sqlite3
import ssl
import sys
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "src-tauri", "resources", "bibles")

# OSIS book ID → our 1-66 number mapping
OSIS_BOOK_MAP = {
    "Gen": 1, "Exod": 2, "Lev": 3, "Num": 4, "Deut": 5,
    "Josh": 6, "Judg": 7, "Ruth": 8, "1Sam": 9, "2Sam": 10,
    "1Kgs": 11, "2Kgs": 12, "1Chr": 13, "2Chr": 14,
    "Ezra": 15, "Neh": 16, "Esth": 17, "Job": 18, "Ps": 19, "Prov": 20,
    "Eccl": 21, "Song": 22, "Isa": 23, "Jer": 24,
    "Lam": 25, "Ezek": 26, "Dan": 27, "Hos": 28, "Joel": 29,
    "Amos": 30, "Obad": 31, "Jonah": 32, "Mic": 33, "Nah": 34, "Hab": 35,
    "Zeph": 36, "Hag": 37, "Zech": 38, "Mal": 39,
    "Matt": 40, "Mark": 41, "Luke": 42, "John": 43, "Acts": 44,
    "Rom": 45, "1Cor": 46, "2Cor": 47, "Gal": 48,
    "Eph": 49, "Phil": 50, "Col": 51,
    "1Thess": 52, "2Thess": 53, "1Tim": 54, "2Tim": 55,
    "Titus": 56, "Phlm": 57, "Heb": 58, "Jas": 59,
    "1Pet": 60, "2Pet": 61, "1John": 62, "2John": 63, "3John": 64,
    "Jude": 65, "Rev": 66,
}

TRANSLATIONS = {
    "kjv": {
        "name": "King James Version",
        "abbreviation": "KJV",
        "language": "English",
        "description": "The King James Version (1769) — public domain",
        "source": "thiagobodruk",
        "file": "en_kjv.json",
    },
    "asv": {
        "name": "American Standard Version",
        "abbreviation": "ASV",
        "language": "English",
        "description": "American Standard Version (1901) — public domain",
        "source": "gratis-bible",
        "file": "en/asv.xml",
    },
    "web": {
        "name": "World English Bible",
        "abbreviation": "WEB",
        "language": "English",
        "description": "World English Bible — public domain",
        "source": "gratis-bible",
        "file": "en/web.xml",
    },
    "ylt": {
        "name": "Young's Literal Translation",
        "abbreviation": "YLT",
        "language": "English",
        "description": "Young's Literal Translation (1898) — public domain",
        "source": "gratis-bible",
        "file": "en/ylt.xml",
    },
    "bbe": {
        "name": "Bible in Basic English",
        "abbreviation": "BBE",
        "language": "English",
        "description": "Bible in Basic English (1965) — public domain",
        "source": "thiagobodruk",
        "file": "en_bbe.json",
    },
    "twi": {
        "name": "Twi Bible",
        "abbreviation": "TWI",
        "language": "Twi",
        "description": "Twi (Akan) Bible — key verses (import full pack for complete text)",
        "source": "manual",
    },
}


def fetch_data(url: str) -> bytes | None:
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
                return resp.read()
        except Exception as e:
            print(f"  Fetch error: {e} (attempt {attempt + 1}/3)")
            if attempt < 2:
                time.sleep(2)
    return None


def create_db(db_path: str, meta: dict) -> sqlite3.Connection:
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    conn.executescript("""
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE verses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            text TEXT NOT NULL
        );
        CREATE INDEX idx_bcv ON verses(book, chapter, verse);
    """)

    for k, v in meta.items():
        conn.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", (k, v))
    conn.commit()
    return conn


def build_from_thiagobodruk(code: str, info: dict) -> bool:
    """Build from thiagobodruk/bible JSON format."""
    db_path = os.path.join(OUTPUT_DIR, f"{code}.db")
    url = f"https://raw.githubusercontent.com/thiagobodruk/bible/master/json/{info['file']}"

    print(f"  Downloading from thiagobodruk/bible: {info['file']}...")
    raw = fetch_data(url)
    if not raw:
        print("  FAILED: Could not download data")
        return False

    data = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(data, list) or len(data) != 66:
        print(f"  FAILED: Expected 66 books, got {len(data) if isinstance(data, list) else 'non-list'}")
        return False

    conn = create_db(db_path, {
        "name": info["name"],
        "abbreviation": info["abbreviation"],
        "language": info["language"],
        "description": info["description"],
    })

    total = 0
    for book_idx, book_data in enumerate(data):
        book_num = book_idx + 1
        book_name = book_data.get("name", f"Book {book_num}")
        chapters = book_data.get("chapters", [])
        book_verses = 0

        for ch_idx, chapter_verses in enumerate(chapters):
            ch_num = ch_idx + 1
            for v_idx, text in enumerate(chapter_verses):
                v_num = v_idx + 1
                text = text.strip() if isinstance(text, str) else str(text).strip()
                if text:
                    conn.execute(
                        "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)",
                        (book_num, ch_num, v_num, text),
                    )
                    book_verses += 1

        total += book_verses
        print(f"  {book_num:2d}. {book_name:20s} — {len(chapters):3d} ch, {book_verses:5d} verses")

    conn.commit()
    print("  Creating text search index...")
    conn.execute("CREATE INDEX idx_text ON verses(text)")
    conn.commit()
    conn.close()

    size_mb = os.path.getsize(db_path) / 1024 / 1024
    print(f"  Total: {total} verses, {size_mb:.1f} MB")
    return True


def get_text_content(elem) -> str:
    """Recursively extract all text from an XML element, skipping notes/titles."""
    parts = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag in ("note", "title", "reference", "rdg"):
            pass  # skip notes, titles, variant readings
        else:
            parts.append(get_text_content(child))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts)


def build_from_gratis_bible(code: str, info: dict) -> bool:
    """Build from gratis-bible/bible OSIS XML format."""
    db_path = os.path.join(OUTPUT_DIR, f"{code}.db")
    url = f"https://raw.githubusercontent.com/gratis-bible/bible/master/{info['file']}"

    print(f"  Downloading from gratis-bible: {info['file']}...")
    raw = fetch_data(url)
    if not raw:
        print("  FAILED: Could not download data")
        return False

    print(f"  Parsing XML ({len(raw) / 1024 / 1024:.1f} MB)...")

    conn = create_db(db_path, {
        "name": info["name"],
        "abbreviation": info["abbreviation"],
        "language": info["language"],
        "description": info["description"],
    })

    # Parse OSIS XML
    root = ET.fromstring(raw)
    ns = {"osis": "http://www.bibletechnologies.net/2003/OSIS/namespace"}

    total = 0
    book_count = 0

    for div in root.iter("{http://www.bibletechnologies.net/2003/OSIS/namespace}div"):
        div_type = div.get("type", "")
        if div_type != "book":
            continue

        osis_id = div.get("osisID", "")
        book_num = OSIS_BOOK_MAP.get(osis_id)
        if not book_num:
            continue

        book_count += 1
        book_verses = 0

        for verse_elem in div.iter("{http://www.bibletechnologies.net/2003/OSIS/namespace}verse"):
            osis_ref = verse_elem.get("osisID", "")
            s_id = verse_elem.get("sID")
            e_id = verse_elem.get("eID")

            # Skip end markers
            if e_id:
                continue

            # Parse reference: e.g. "Gen.1.1"
            parts = osis_ref.split(".")
            if len(parts) < 3:
                continue

            try:
                ch_num = int(parts[1])
                v_num = int(parts[2])
            except ValueError:
                continue

            text = get_text_content(verse_elem).strip()
            # Clean up whitespace
            text = re.sub(r"\s+", " ", text).strip()

            if text and v_num > 0:
                conn.execute(
                    "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)",
                    (book_num, ch_num, v_num, text),
                )
                book_verses += 1

        total += book_verses
        print(f"  {book_num:2d}. {osis_id:12s} — {book_verses:5d} verses")

    conn.commit()

    if total == 0:
        print("  WARNING: No verses extracted — trying milestone format...")
        conn.close()
        os.remove(db_path)
        return build_osis_milestone(code, info, raw)

    print("  Creating text search index...")
    conn.execute("CREATE INDEX idx_text ON verses(text)")
    conn.commit()
    conn.close()

    size_mb = os.path.getsize(db_path) / 1024 / 1024
    print(f"  Total: {total} verses, {size_mb:.1f} MB")
    return True


def build_osis_milestone(code: str, info: dict, raw: bytes) -> bool:
    """Handle OSIS milestone format where verses use sID/eID markers."""
    db_path = os.path.join(OUTPUT_DIR, f"{code}.db")

    conn = create_db(db_path, {
        "name": info["name"],
        "abbreviation": info["abbreviation"],
        "language": info["language"],
        "description": info["description"],
    })

    # For milestone format, we need to walk the tree and collect text between verse start/end markers
    root = ET.fromstring(raw)
    ns_uri = "http://www.bibletechnologies.net/2003/OSIS/namespace"
    total = 0
    current_book = None
    current_verse_ref = None
    verse_parts = []

    def flush_verse():
        nonlocal total, current_verse_ref, verse_parts
        if not current_verse_ref or not verse_parts:
            current_verse_ref = None
            verse_parts = []
            return

        text = " ".join(verse_parts).strip()
        text = re.sub(r"\s+", " ", text)
        parts = current_verse_ref.split(".")
        if len(parts) >= 3:
            book_id = parts[0]
            book_num = OSIS_BOOK_MAP.get(book_id)
            if book_num:
                try:
                    ch = int(parts[1])
                    v = int(parts[2])
                    if text and v > 0:
                        conn.execute(
                            "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)",
                            (book_num, ch, v, text),
                        )
                        total += 1
                except ValueError:
                    pass

        current_verse_ref = None
        verse_parts = []

    def walk(elem):
        nonlocal current_book, current_verse_ref, verse_parts

        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        if tag == "div" and elem.get("type") == "book":
            current_book = elem.get("osisID", "")

        if tag == "verse":
            s_id = elem.get("sID")
            e_id = elem.get("eID")
            if s_id:
                flush_verse()
                current_verse_ref = elem.get("osisID", s_id)
            elif e_id:
                flush_verse()
                return

        if tag in ("note", "title", "reference", "rdg"):
            if elem.tail and current_verse_ref:
                verse_parts.append(elem.tail.strip())
            return

        if elem.text and current_verse_ref:
            verse_parts.append(elem.text.strip())

        for child in elem:
            walk(child)

        if elem.tail and current_verse_ref:
            t = elem.tail.strip()
            if t and tag not in ("verse",):
                verse_parts.append(t)

    walk(root)
    flush_verse()

    conn.commit()

    if total > 0:
        print("  Creating text search index...")
        conn.execute("CREATE INDEX idx_text ON verses(text)")
        conn.commit()

    conn.close()

    size_mb = os.path.getsize(db_path) / 1024 / 1024
    print(f"  Total (milestone): {total} verses, {size_mb:.1f} MB")
    return total > 0


def build_twi_placeholder(info: dict) -> bool:
    """Build a placeholder Twi Bible with key verses."""
    db_path = os.path.join(OUTPUT_DIR, "twi.db")

    conn = create_db(db_path, {
        "name": info["name"],
        "abbreviation": info["abbreviation"],
        "language": info["language"],
        "description": info["description"],
    })

    # Key verses in Asante Twi
    twi_verses = [
        (1, 1, 1, "Mfitiaseɛ no Onyankopɔn bɔɔ ɔsoro ne asase."),
        (1, 1, 2, "Na asase yɛ basabasa, na so nni hwee; na esum kata bun no anim. Na Onyankopɔn Honhom keka nsuo no anim."),
        (1, 1, 3, "Na Onyankopɔn kae se, Ma hann mmra; na hann bae."),
        (1, 1, 4, "Na Onyankopɔn huu hann no se eye; na Onyankopɔn tee hann no ne esum no mu."),
        (1, 1, 5, "Na Onyankopɔn too hann no din Adekyee, na esum no nso ɔtoo no din Anadwo. Na anwummere ne anɔpa bae, da a edi kan."),
        (1, 1, 6, "Na Onyankopɔn kae se, Ma nsu no mu ntwam ntam mmra, na ɛntwe nsu no mu."),
        (1, 1, 7, "Na Onyankopɔn yɛɛ ntwam ntam no, na ɔtew nsu a ɛwɔ ntwam ntam no ase ne nsu a ɛwɔ ntwam ntam no atifi mu; na ɛyɛɛ saa."),
        (1, 1, 8, "Na Onyankopɔn too ntwam ntam no din Soro. Na anwummere ne anɔpa bae, da a ɛto so abien."),
        (1, 1, 9, "Na Onyankopɔn kae se, Ma nsu a ɛwɔ ɔsoro ase no nyinaa mmeboaboa ano wɔ beae koro, na ma asase ɛweɛ mmpue; na ɛyɛɛ saa."),
        (1, 1, 10, "Na Onyankopɔn too asase ɛweɛ no din Asase; na nsu a abom no nso ɔtoo no din Po; na Onyankopɔn huu se eye."),
        # Genesis 1:26-31
        (1, 1, 26, "Na Onyankopɔn kae se, Momma yɛnyɛ onipa wɔ yɛn sɛso mu, sɛ yɛn suban te; na ɔnni po mu mpataa ne wim nnomaa ne mmoadoma ne asase nyinaa ne abɔde a ɛwea asase so nyinaa so."),
        (1, 1, 27, "Na Onyankopɔn bɔɔ onipa wɔ ne sɛso mu; Onyankopɔn sɛso mu na ɔbɔɔ no; ɔbarima ne ɔbea na ɔbɔɔ wɔn."),
        (1, 1, 28, "Na Onyankopɔn hyiraa wɔn, na Onyankopɔn ka kyerɛɛ wɔn se, Munyɛ na munni asase so ma, na munni so; na munni po mu nam ne wim nnomaa ne abɔde biara a ɛwea asase so so."),
        # Psalm 23
        (19, 23, 1, "Awurade ne me hwɛfo; biribi renhia me."),
        (19, 23, 2, "Ɔma me da sare afuom; ɔde me kɔ nsu a emu dwo ho."),
        (19, 23, 3, "Ɔma me kra san ba mu. Ɔde me fa trenee akwan mu, ne din nti."),
        (19, 23, 4, "Yea sɛ mifa owu sunsumma bon mu a, merensuro bɔne; na wo ne me na ɛwɔ hɔ; wo pema ne wo poma, ɛno na ɛkyekyeɛ me were."),
        (19, 23, 5, "Wutenten me pon wɔ m'atamfo anim; wode ngo sra me ti; m'kuruwa bu so ma."),
        (19, 23, 6, "Ampa, papayɛ ne adɔe bedi m'akyi me nkwa nna nyinaa mu; na mɛtena Awurade fi da nyinaa."),
        # John 3:16-17
        (43, 3, 16, "Na Onyankopɔn dɔɔ wiase yi dɛ, ɔde ne Ba a ɔwo no korɔ no mae, na obiara a ogye no di no, yɛnnyera, na ɔbɛnya daa nkwa."),
        (43, 3, 17, "Na Onyankopɔn ansoma ne Ba no amma wiase sɛ ɔmmɛbu wiase atɛn; na mmom sɛ wiase nam no so mfiri asu."),
        # Romans 8:28, 31, 37-39
        (45, 8, 28, "Na yenim se wɔn a wɔdɔ Onyankopɔn no, nneɛma nyinaa yɛ wɔn yiye, wɔn a wɔafrɛ wɔn sɛ n'apɛde te no."),
        (45, 8, 31, "Na dɛn na yɛbɛka afa nneɛma yi ho? Sɛ Onyankopɔn ka yɛn ho a, hena na obetumi atia yɛn?"),
        (45, 8, 37, "Nso nneɛma yi nyinaa mu no yedi nkonim so a ɛboro so denam nea ɔdɔɔ yɛn no so."),
        (45, 8, 38, "Na migye di se owu anaa nkwa, anaa abɔfo, anaa atumfo, anaa nneɛma a ɛwɔ hɔ mprempren, anaa nneɛma a ɛreba,"),
        (45, 8, 39, "anaa ɔsorokɛse, anaa bun, anaa abɔde biara rentumi ntew yɛn mfi Onyankopɔn dɔ a ɛwɔ Kristo Yesu yɛn Awurade mu no ho."),
        # Matthew 28:19-20
        (40, 28, 19, "Enti monkɔ na monkɔyɛ aman nyinaa asuafo, na mommɔ wɔn asu wɔ Agya ne Ɔba ne Honhom Kronkron din mu;"),
        (40, 28, 20, "na monkyerɛ wɔn na wɔnni nneɛma a mahy amo nyinaa so; na hwɛ, me ne mo wɔ hɔ nna nyinaa de kosi wiase awiei."),
        # Proverbs 3:5-6
        (20, 3, 5, "Fa wo koma nyinaa to Awurade so, na mfa wo ankasa nhumu nni."),
        (20, 3, 6, "Wo akwan nyinaa mu no, hu no, na ɔbɛtene wo akwan."),
        # Isaiah 40:31
        (23, 40, 31, "Na wɔn a wɔtwɛn Awurade no bɛnya ahoɔden foforo; wɔbɛtua ntaban sɛ akɔdeɛ; wɔbɛtu mmirika a wɔrenhome; wɔbɛnante a wɔrenbrɛ."),
        # Philippians 4:13
        (50, 4, 13, "Metumi ayɛ nneɛma nyinaa wo Kristo a ɔhyɛ me den no mu."),
        # Jeremiah 29:11
        (24, 29, 11, "Na menim adwene a medwene fa mo ho, Awurade na ɔse, asomdwoe adwene na ɛnte sɛ ɔhaw no, sɛ mede anidaso a ɛdi akyiri bɛma mo."),
        # Psalm 119:105
        (19, 119, 105, "Wo asɛm yɛ kanea ma me nan, na ɛyɛ hann ma m'akwan."),
        # Joshua 1:9
        (6, 1, 9, "Enhyɛ wo nkuran? Yɛ den na ma wo bo nyɛ duru. Nsuro na mma wo bo mfow wo, na Awurade wo Nyankopɔn no ne wo wɔ hɔ baabiara a wobɛkɔ."),
        # Psalm 91:1-2
        (19, 91, 1, "Nea ɔte Ɔsorosoroni hintabea no, ɔbɛda Otumfoɔ no suna ase."),
        (19, 91, 2, "Mɛka fa Awurade ho se, Me guankɔbea ne me banbɔ ne me; me Nyankopɔn a mede me ho to no so."),
        # Psalm 1
        (19, 1, 1, "Nhyira ne onipa a ɔnante nnebɔnefo agyina mu, na ɔnnyina nnebɔneyɛfo kwan mu, na ɔntra fɛwdifo trabea so."),
        (19, 1, 2, "Na mmom ne anigyeɛ ne Awurade mmara; na n'anim wɔ ne mmara so awia ne anadwo."),
        (19, 1, 3, "Na ɔte sɛ dua a wɔadua wɔ nsuo nkyen, a ɛso n'aba wɔ ne berɛ mu, na n'ahahan nso mpɔ; na biribiara a ɔyɛ no nkɔ yiye."),
        (19, 1, 4, "Nnebɔnefo nte saa, na mmom wɔte sɛ ntɛtɛ a mframa bɔ guan."),
        (19, 1, 5, "Enti nnebɔnefo rennyina atemmu mu, na nnebɔneyɛfo nso rennyina atreneefo badwa mu."),
        (19, 1, 6, "Na Awurade nim atreneefo kwan; na nnebɔnefo kwan bɛyera."),
        # Psalm 150
        (19, 150, 1, "Munyi Awurade. Munyi Onyankopɔn wɔ ne kronkronbea mu; munyi no wɔ ne tumi soro wɔ ne trɛneɛ mu."),
        (19, 150, 2, "Munyi no wɔ ne tumi nnwuma mu; munyi no sɛ ne kɛseyɛ dodoɔ te."),
        (19, 150, 3, "Munyi no wɔ totorobɛnto hyɛn mu; munyi no wɔ sanku ne bɛntɛ mu."),
        (19, 150, 4, "Munyi no wɔ mpintin ne asa mu; munyi no wɔ ntorowa ne atɛntɛben mu."),
        (19, 150, 5, "Munyi no wɔ nkrawiri a ɛbom mu; munyi no wɔ nkrawiri a ɛgyegye mu."),
        (19, 150, 6, "Biribiara a ɛhome no, ma ɔnyi Awurade. Munyi Awurade."),
    ]

    for book, ch, v, text in twi_verses:
        conn.execute(
            "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)",
            (book, ch, v, text),
        )

    conn.commit()
    conn.execute("CREATE INDEX idx_text ON verses(text)")
    conn.commit()
    conn.close()

    size_kb = os.path.getsize(db_path) / 1024
    print(f"  Created Twi placeholder: {len(twi_verses)} key verses ({size_kb:.0f} KB)")
    print("  Note: Import a full Twi Bible pack for complete text")
    return True


def build_translation(code: str, info: dict) -> bool:
    print(f"\n{'='*60}")
    print(f"Building {info['name']} ({info['abbreviation']})")
    print(f"{'='*60}")

    source = info["source"]

    if source == "thiagobodruk":
        return build_from_thiagobodruk(code, info)
    elif source == "gratis-bible":
        return build_from_gratis_bible(code, info)
    elif source == "manual":
        return build_twi_placeholder(info)
    else:
        print(f"  Unknown source: {source}")
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    requested = [a for a in sys.argv[1:] if not a.startswith("-")]

    if requested:
        to_build = {k: v for k, v in TRANSLATIONS.items() if k in requested}
        if not to_build:
            print(f"Unknown: {requested}. Available: {', '.join(TRANSLATIONS.keys())}")
            sys.exit(1)
    else:
        to_build = TRANSLATIONS

    print(f"Building {len(to_build)} Bible translation(s)")
    print(f"Output: {OUTPUT_DIR}")

    results = {}
    for code, info in to_build.items():
        results[code] = build_translation(code, info)

    print(f"\n{'='*60}")
    print("BUILD SUMMARY")
    print(f"{'='*60}")
    for code, success in results.items():
        info = TRANSLATIONS[code]
        db_path = os.path.join(OUTPUT_DIR, f"{code}.db")
        size = os.path.getsize(db_path) / 1024 / 1024 if os.path.exists(db_path) else 0
        status = "OK" if success else "FAILED"
        print(f"  {info['abbreviation']:5s} {status:6s} {size:5.1f} MB  {info['name']}")


if __name__ == "__main__":
    main()
