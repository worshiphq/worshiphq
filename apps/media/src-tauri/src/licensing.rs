use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct LicenseStatus {
    pub is_licensed: bool,
    pub is_trial: bool,
    pub trial_days_remaining: i32,
    pub hwid: String,
}

/// Get a hardware-bound identifier that survives app uninstall.
/// On Windows: uses WMI to get the motherboard UUID.
/// This ID is tied to the physical machine, not the user account.
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
            // Fallback: use volume serial number
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

/// Check license status for this hardware.
/// In production, this checks:
/// 1. Local registry/keychain for cached license
/// 2. Server API for license validation
/// 3. Trial start date stored in registry
pub fn check_license(hwid: &str) -> Result<LicenseStatus, String> {
    // TODO: Implement full license checking
    // For now, return trial status
    Ok(LicenseStatus {
        is_licensed: false,
        is_trial: true,
        trial_days_remaining: 14,
        hwid: hwid.to_string(),
    })
}
