import { isDesktopApp } from "./media-src";
import { useProjectionStore } from "../stores/projection-store";

/**
 * The licence stamp, checked by the app's Rust core: a licence signed by WorshipHQ's server for this computer.
 * Nobody can make one without the server, and it works offline for up to 30 days at a time.
 */
export interface LicenceStatus {
  valid: boolean;
  /** "none" | "ok" | "expired" | "other_computer" | "bad" | "clock" */
  reason: string;
  church: string | null;
  church_id: string | null;
  until: string | null;
  expires: number | null;
  trial: boolean;
}

const NONE: LicenceStatus = { valid: false, reason: "none", church: null, church_id: null, until: null, expires: null, trial: false };

export async function licenceStatus(): Promise<LicenceStatus> {
  if (!isDesktopApp()) return NONE;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LicenceStatus>("licence_status").catch(() => NONE);
}

export async function saveLicence(licence: string | null | undefined): Promise<void> {
  if (!licence || !isDesktopApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("licence_save", { licence }).catch((e) => console.warn("licence not kept:", e));
}

export async function clearLicence(): Promise<void> {
  if (!isDesktopApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("licence_clear").catch(() => {});
}

/** Check the stamp and put the answer where the screens read it (licensed, trial, days left). */
export async function refreshLicence(): Promise<LicenceStatus> {
  const st = await licenceStatus();
  let hwid = "browser-dev";
  if (isDesktopApp()) {
    const { invoke } = await import("@tauri-apps/api/core");
    hwid = await invoke<string>("get_hwid").catch(() => "unknown");
  }
  const days = st.until ? Math.max(0, Math.ceil((new Date(st.until).getTime() - Date.now()) / 86_400_000)) : 0;
  useProjectionStore.getState().setLicense({ isLicensed: st.valid, isTrial: st.trial, trialDaysRemaining: days, hwid });
  return st;
}
