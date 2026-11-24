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
    /// Church or person this copy is registered to (shown in Settings › About).
    #[serde(default)]
    registered_to: Option<String>,
    #[serde(default)]
    activated_epoch: Option<u64>,
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
        // Worked out once per run (it starts a small hidden process).
        static HWID: std::sync::OnceLock<String> = std::sync::OnceLock::new();
        return Ok(HWID.get_or_init(windows_hardware_id).clone());
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

/// The motherboard's id (SMBIOS UUID). It stays the same after Windows is reinstalled or the disk is formatted,
/// which is what lets WorshipHQ give each computer one free trial. "wmic" is gone from new Windows 11, so this asks
/// Windows through PowerShell first, then wmic, then the Windows install id, then the disk serial.
#[cfg(target_os = "windows")]
fn windows_hardware_id() -> String {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let run = |exe: &str, args: &[&str]| -> String {
        Command::new(exe)
            .args(args)
            .creation_flags(NO_WINDOW)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default()
    };
    let good = |u: &str| {
        let u = u.trim();
        u.len() >= 32
            && !u.chars().all(|c| c == 'F' || c == '-' || c == '0')
            && u != "03000200-0400-0500-0006-000700080009"
    };

    let ps = run("powershell", &["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"]);
    let ps = ps.trim().to_uppercase();
    if good(&ps) {
        return format!("WHQ-{ps}");
    }
    let wm = run("wmic", &["csproduct", "get", "uuid"]);
    let wm = wm.lines().nth(1).unwrap_or("").trim().to_uppercase();
    if good(&wm) {
        return format!("WHQ-{wm}");
    }
    let reg = run("reg", &["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"]);
    if let Some(g) = reg.lines().find(|l| l.contains("MachineGuid")).and_then(|l| l.split_whitespace().last()) {
        return format!("WHQ-MG-{}", g.to_uppercase());
    }
    let vol = run("cmd", &["/c", "vol c:"]);
    let serial = vol.lines().find(|l| l.contains("Serial")).and_then(|l| l.split_whitespace().last()).unwrap_or("UNKNOWN").to_string();
    format!("WHQ-VOL-{serial}")
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

#[derive(Debug, Serialize)]
pub struct LicenseInfo {
    pub is_licensed: bool,
    pub is_trial: bool,
    pub trial_days_remaining: i32,
    pub hwid: String,
    pub license_key: Option<String>,
    pub registered_to: Option<String>,
    pub activated_epoch: Option<u64>,
}

/// Everything Settings › About shows about this copy.
pub fn license_info(hwid: &str, data_dir: &PathBuf) -> Result<LicenseInfo, String> {
    let st = check_license(hwid, data_dir)?;
    let lf = read_license_file(data_dir);
    Ok(LicenseInfo {
        is_licensed: st.is_licensed,
        is_trial: st.is_trial,
        trial_days_remaining: st.trial_days_remaining,
        hwid: st.hwid,
        license_key: lf.license_key.filter(|_| st.is_licensed),
        registered_to: lf.registered_to,
        activated_epoch: lf.activated_epoch,
    })
}

pub fn set_registered_to(data_dir: &PathBuf, name: &str) -> Result<(), String> {
    let mut lf = read_license_file(data_dir);
    let n = name.trim();
    lf.registered_to = if n.is_empty() { None } else { Some(n.chars().take(120).collect()) };
    write_license_file(data_dir, &lf)
}
