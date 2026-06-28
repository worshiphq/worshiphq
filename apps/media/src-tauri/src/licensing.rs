use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const TRIAL_DAYS: i32 = 14;
const LICENSE_SECRET: &str = "WHQ_MEDIA_2025_LK";

#[derive(Debug, Serialize)]
pub struct LicenseStatus {
    pub is_licensed: bool,
    pub is_trial: bool,
    pub trial_days_remaining: i32,
    pub hwid: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct LicenseFile {
    trial_start_epoch: Option<u64>,
    license_key: Option<String>,
}

fn license_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("license.json")
}

fn read_license_file(data_dir: &PathBuf) -> LicenseFile {
    let path = license_path(data_dir);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_license_file(data_dir: &PathBuf, lf: &LicenseFile) -> Result<(), String> {
    let path = license_path(data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(lf).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn generate_valid_key(hwid: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(hwid.as_bytes());
    hasher.update(LICENSE_SECRET.as_bytes());
    let hash = hasher.finalize();
    let hex: String = hash.iter().map(|b| format!("{:02X}", b)).collect();
    format!(
        "WHQ-{}-{}-{}-{}",
        &hex[0..4],
        &hex[4..8],
        &hex[8..12],
        &hex[12..16]
    )
}

pub fn get_hardware_id() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("wmic")
            .args(["csproduct", "get", "uuid"])
            .output()
            .map_err(|e| format!("Failed to get HWID: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let hwid = stdout
            .lines()
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string();

        if hwid.is_empty() || hwid == "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" {
            let output = Command::new("cmd")
                .args(["/c", "vol c:"])
                .output()
                .map_err(|e| format!("Failed to get volume serial: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let serial = stdout
                .lines()
                .find(|l| l.contains("Serial"))
                .unwrap_or("")
                .split_whitespace()
                .last()
                .unwrap_or("UNKNOWN")
                .to_string();

            return Ok(format!("WHQ-VOL-{}", serial));
        }

        Ok(format!("WHQ-{}", hwid))
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
            .map_err(|e| format!("Failed to get HWID: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let uuid = stdout
            .lines()
            .find(|l| l.contains("IOPlatformUUID"))
            .unwrap_or("")
            .split('"')
            .nth(3)
            .unwrap_or("UNKNOWN")
            .to_string();

        Ok(format!("WHQ-{}", uuid))
    }

    #[cfg(target_os = "linux")]
    {
        let output = Command::new("cat")
            .arg("/etc/machine-id")
            .output()
            .map_err(|e| format!("Failed to get HWID: {}", e))?;

        let machine_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(format!("WHQ-{}", machine_id))
    }
}

pub fn check_license(hwid: &str, data_dir: &PathBuf) -> Result<LicenseStatus, String> {
    let mut lf = read_license_file(data_dir);

    // Check saved license key first
    if let Some(ref key) = lf.license_key {
        let valid_key = generate_valid_key(hwid);
        if key.eq_ignore_ascii_case(&valid_key) {
            return Ok(LicenseStatus {
                is_licensed: true,
                is_trial: false,
                trial_days_remaining: 0,
                hwid: hwid.to_string(),
            });
        }
    }

    // Trial: record first launch if not set
    let trial_start = match lf.trial_start_epoch {
        Some(ts) => ts,
        None => {
            let now = now_epoch();
            lf.trial_start_epoch = Some(now);
            write_license_file(data_dir, &lf)?;
            now
        }
    };

    let elapsed_secs = now_epoch().saturating_sub(trial_start);
    let elapsed_days = (elapsed_secs / 86400) as i32;
    let remaining = (TRIAL_DAYS - elapsed_days).max(0);

    Ok(LicenseStatus {
        is_licensed: false,
        is_trial: true,
        trial_days_remaining: remaining,
        hwid: hwid.to_string(),
    })
}

pub fn activate_license(hwid: &str, key: &str, data_dir: &PathBuf) -> Result<LicenseStatus, String> {
    let valid_key = generate_valid_key(hwid);
    let input = key.trim().to_uppercase();

    if input != valid_key {
        return Err("Invalid license key".to_string());
    }

    let mut lf = read_license_file(data_dir);
    lf.license_key = Some(input);
    write_license_file(data_dir, &lf)?;

    Ok(LicenseStatus {
        is_licensed: true,
        is_trial: false,
        trial_days_remaining: 0,
        hwid: hwid.to_string(),
    })
}

/// Generate a license key for a given HWID (admin/server use)
pub fn generate_key_for_hwid(hwid: &str) -> String {
    generate_valid_key(hwid)
}
