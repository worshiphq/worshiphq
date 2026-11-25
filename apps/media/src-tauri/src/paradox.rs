//! Reads Paradox tables (.DB with .MB), which EasyWorship 2009 and older keep their songs in. Read-only.

use std::collections::HashMap;
use std::path::Path;

fn u16_at(b: &[u8], o: usize) -> Option<usize> {
    Some(u16::from_le_bytes([*b.get(o)?, *b.get(o + 1)?]) as usize)
}
fn u32_at(b: &[u8], o: usize) -> Option<usize> {
    Some(u32::from_le_bytes([*b.get(o)?, *b.get(o + 1)?, *b.get(o + 2)?, *b.get(o + 3)?]) as usize)
}

/// Every row as field name → text (text and memo fields only).
pub fn read_table(db: &Path) -> Result<Vec<HashMap<String, String>>, String> {
    let b = std::fs::read(db).map_err(|e| format!("Couldn't read {}: {e}", db.display()))?;
    let mb = std::fs::read(db.with_extension("MB")).unwrap_or_default();
    table(&b, &mb).ok_or_else(|| "That isn't a song table WorshipHQ can read.".to_string())
}

fn table(b: &[u8], mb: &[u8]) -> Option<Vec<HashMap<String, String>>> {
    let record = u16_at(b, 0)?;
    let header = u16_at(b, 2)?;
    let kind = *b.get(4)?;
    let block = *b.get(5)? as usize * 1024;
    let first = u16_at(b, 0x0e)?;
    let count = u16_at(b, 0x21)?;
    let version = *b.get(0x39)?;
    if record == 0 || block == 0 || count == 0 || (kind != 0 && kind != 2) {
        return None;
    }
    // Password-protected tables can't be read.
    let key = u32_at(b, 0x25)?;
    let key = if key == 0xFF00_FF00 { u32_at(b, 0x5c)? } else { key };
    if key != 0 {
        return None;
    }

    let mut at = if version > 4 { 0x78 } else { 0x58 };
    let mut fields: Vec<(u8, usize)> = Vec::new();
    for _ in 0..count {
        let t = *b.get(at)?;
        let size = *b.get(at + 1)? as usize;
        fields.push((t, if t == 0x17 { 17 } else { size }));
        at += 2;
    }
    if fields.iter().map(|f| f.1).sum::<usize>() != record {
        return None;
    }
    at += 4 + 4 * count + if version >= 0x0c { 261 } else { 79 };
    let mut names = Vec::new();
    for _ in 0..count {
        let end = at + b.get(at..)?.iter().position(|&c| c == 0)?;
        names.push(text(&b[at..end]));
        at = end + 1;
    }

    let mut out = Vec::new();
    let mut n = first;
    let mut seen = std::collections::HashSet::new();
    while n != 0 && seen.insert(n) {
        let start = header + (n - 1) * block;
        let Some(data) = b.get(start..(start + block).min(b.len())) else { break };
        let next = u16_at(data, 0)?;
        let used = u16_at(data, 4)? as u16 as i16;
        if used >= 0 {
            for r in 0..=(used as usize / record) {
                let Some(row) = data.get(6 + r * record..6 + (r + 1) * record) else { break };
                let mut map = HashMap::new();
                let mut o = 0;
                for (f, name) in fields.iter().zip(&names) {
                    let raw = &row[o..o + f.1];
                    o += f.1;
                    let value = match f.0 {
                        0x01 => text(raw),
                        // Memo, formatted memo
                        0x0c | 0x0e => memo(raw, mb),
                        _ => continue,
                    };
                    map.insert(name.clone(), value);
                }
                out.push(map);
            }
        }
        n = next;
    }
    Some(out)
}

fn memo(raw: &[u8], mb: &[u8]) -> String {
    if raw.len() < 10 {
        return String::new();
    }
    let lead = raw.len() - 10;
    let (Some(ptr), Some(len)) = (u32_at(raw, lead), u32_at(raw, lead + 4)) else { return String::new() };
    if len <= lead {
        return text(&raw[..len]);
    }
    let (offset, index) = (ptr & 0xffff_ff00, ptr & 0xff);
    let start = if index == 0xff {
        offset + 9
    } else {
        // A block shared by small pieces: its own list says where each one is (in 16-byte steps).
        match mb.get(offset + 12 + 5 * index) {
            Some(&o) => offset + o as usize * 16,
            None => return String::new(),
        }
    };
    mb.get(start..start + len).map(text).unwrap_or_default()
}

/// Windows-1252, up to the first zero.
fn text(raw: &[u8]) -> String {
    const HIGH: &str = "€\u{81}‚ƒ„…†‡ˆ‰Š‹Œ\u{8d}Ž\u{8f}\u{90}‘’“”•–—˜™š›œ\u{9d}žŸ";
    raw.iter()
        .take_while(|&&c| c != 0)
        .map(|&c| if (0x80..0xa0).contains(&c) { HIGH.chars().nth(c as usize - 0x80).unwrap_or(' ') } else { c as char })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_easyworship_2009() {
        let p = std::path::Path::new("C:\\Users\\Public\\Documents\\Softouch\\EasyWorship\\Default\\Databases\\Data\\Songs.DB");
        if !p.exists() {
            return;
        }
        let rows = super::read_table(p).unwrap();
        println!("{} rows, {} with words, {} whole rtf", rows.len(), rows.iter().filter(|r| r["Words"].len() > 20).count(), rows.iter().filter(|r| r["Words"].trim_end().ends_with('}')).count());
        println!("{:?} / {:?}", rows[5]["Title"], rows[5]["Words"].chars().take(300).collect::<String>());
    }
}
