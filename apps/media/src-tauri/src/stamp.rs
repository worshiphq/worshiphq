//! The licence stamp. WorshipHQ's server signs each computer's licence with its private key (Ed25519); this app
//! only has the public key, so it can check a licence but never make one. A licence names the church, this
//! computer (a hash of its motherboard id) and the date it runs out (at most 30 days ahead; the app renews it
//! whenever it is online). Winding the clock back to stretch a licence is noticed.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const PUBLIC_KEY_B64: &str = include_str!("licence_public_key.txt");
/// How far the clock may go back (time zones, a fixed BIOS clock) before we call it winding back.
const CLOCK_SLACK_SECS: u64 = 2 * 86400;

#[derive(Debug, Deserialize)]
struct Payload {
    v: u32,
    cid: String,
    church: String,
    did: String,
    exp: u64,
    until: String,
    trial: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct StampFile {
    licence: Option<String>,
    /// The latest time this computer's clock has shown while the app ran.
    last_seen: u64,
}

#[derive(Debug, Serialize)]
pub struct StampStatus {
    pub valid: bool,
    /// "none" | "ok" | "expired" | "other_computer" | "bad" | "clock"
    pub reason: String,
    pub church: Option<String>,
    pub church_id: Option<String>,
    pub until: Option<String>,
    /// When this copy of the licence stops working offline (seconds since 1970).
    pub expires: Option<u64>,
    pub trial: bool,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn path(dir: &Path) -> PathBuf {
    dir.join("licence-stamp.json")
}

fn read(dir: &Path) -> StampFile {
    fs::read_to_string(path(dir)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn write(dir: &Path, f: &StampFile) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(path(dir), serde_json::to_string(f).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Same as the server's hashDeviceId: sha256("whq-media:" + raw id), first 40 hex characters.
fn device_hash(hwid: &str) -> String {
    let h = Sha256::digest(format!("whq-media:{hwid}").as_bytes());
    h.iter().map(|b| format!("{b:02x}")).collect::<String>()[..40].to_string()
}

/// The licence's contents if WorshipHQ's signature on it is genuine.
fn open(licence: &str) -> Option<Payload> {
    let (body, sig) = licence.trim().split_once('.')?;
    let body = URL_SAFE_NO_PAD.decode(body).ok()?;
    let sig = URL_SAFE_NO_PAD.decode(sig).ok()?;
    let key: [u8; 32] = STANDARD.decode(PUBLIC_KEY_B64.trim()).ok()?.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&key).ok()?;
    let sig = Signature::from_slice(&sig).ok()?;
    key.verify(&body, &sig).ok()?;
    let p: Payload = serde_json::from_slice(&body).ok()?;
    (p.v == 1).then_some(p)
}

fn status_of(licence: &str, hwid: &str, last_seen: u64) -> StampStatus {
    let mut s = StampStatus { valid: false, reason: "bad".into(), church: None, church_id: None, until: None, expires: None, trial: false };
    let Some(p) = open(licence) else { return s };
    s.church = Some(p.church.clone());
    s.church_id = Some(p.cid.clone());
    s.until = Some(p.until.clone());
    s.expires = Some(p.exp);
    s.trial = p.trial;
    let t = now();
    s.reason = if p.did != device_hash(hwid) {
        "other_computer"
    } else if t + CLOCK_SLACK_SECS < last_seen {
        "clock"
    } else if t >= p.exp {
        "expired"
    } else {
        s.valid = true;
        "ok"
    }
    .into();
    s
}

/// Keep a licence the server sent (only if it is genuine and for this computer).
pub fn save(dir: &Path, hwid: &str, licence: &str) -> Result<StampStatus, String> {
    let mut f = read(dir);
    let st = status_of(licence, hwid, f.last_seen);
    if st.reason == "bad" || st.reason == "other_computer" {
        return Err("That licence isn't valid for this computer.".into());
    }
    f.licence = Some(licence.trim().to_string());
    f.last_seen = f.last_seen.max(now());
    write(dir, &f)?;
    Ok(st)
}

/// Is this computer licensed right now? Also remembers the latest time seen, to notice the clock being wound back.
pub fn status(dir: &Path, hwid: &str) -> StampStatus {
    let mut f = read(dir);
    let Some(lic) = f.licence.clone() else {
        return StampStatus { valid: false, reason: "none".into(), church: None, church_id: None, until: None, expires: None, trial: false };
    };
    let st = status_of(&lic, hwid, f.last_seen);
    if st.reason != "clock" && now() > f.last_seen {
        f.last_seen = now();
        let _ = write(dir, &f);
    }
    st
}

/// Signing out: forget the licence (the clock record stays).
pub fn clear(dir: &Path) -> Result<(), String> {
    let mut f = read(dir);
    f.licence = None;
    write(dir, &f)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Run with LICENCE_TEST (a licence from the server) and HWID_TEST (the computer it was made for).
    #[test]
    fn checks_a_server_licence() {
        let (Ok(lic), Ok(hwid)) = (std::env::var("LICENCE_TEST"), std::env::var("HWID_TEST")) else { return };
        let st = status_of(&lic, &hwid, 0);
        assert!(st.valid, "genuine licence rejected: {}", st.reason);
        assert_eq!(status_of(&lic, "WHQ-SOME-OTHER-PC", 0).reason, "other_computer");
        // Change one character of the contents: the signature no longer matches.
        let mut forged = lic.clone().into_bytes();
        forged[5] = if forged[5] == b'A' { b'B' } else { b'A' };
        assert_eq!(status_of(&String::from_utf8(forged).unwrap(), &hwid, 0).reason, "bad");
        // The clock wound back by a week from the last time seen.
        assert_eq!(status_of(&lic, &hwid, now() + 7 * 86400).reason, "clock");
    }
}
