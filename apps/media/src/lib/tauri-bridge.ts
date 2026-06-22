import type { DisplayInfo, BibleVerse, Slide } from "../types";

const IS_TAURI = "__TAURI__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) {
    console.warn(`[tauri-bridge] Not in Tauri context, skipping: ${cmd}`);
    return undefined as T;
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// Display management
export async function listDisplays(): Promise<DisplayInfo[]> {
  if (!IS_TAURI) {
    return [
      { id: 0, name: "Primary Display", width: 1920, height: 1080, isPrimary: true },
    ];
  }
  return invoke<DisplayInfo[]>("list_displays");
}

// Projection control
export async function goLive(slide: Slide): Promise<void> {
  return invoke("go_live", { slideJson: JSON.stringify(slide) });
}

export async function goBlack(): Promise<void> {
  return invoke("go_black");
}

export async function goClear(): Promise<void> {
  return invoke("go_clear");
}

// Bible
export async function searchBible(
  dbPath: string,
  book: number,
  chapter: number,
  verseStart: number,
  verseEnd: number,
): Promise<BibleVerse[]> {
  if (!IS_TAURI) return [];
  return invoke<BibleVerse[]>("search_bible", { dbPath, book, chapter, verseStart, verseEnd });
}

export async function searchBibleText(
  dbPath: string,
  query: string,
): Promise<BibleVerse[]> {
  if (!IS_TAURI) return [];
  return invoke<BibleVerse[]>("search_bible_text", { dbPath, query });
}

// Licensing
export async function getHwid(): Promise<string> {
  if (!IS_TAURI) return "WHQ-DEV-MODE";
  return invoke<string>("get_hwid");
}

export async function checkLicense(hwid: string): Promise<{
  is_licensed: boolean;
  is_trial: boolean;
  trial_days_remaining: number;
  hwid: string;
}> {
  if (!IS_TAURI) {
    return { is_licensed: false, is_trial: true, trial_days_remaining: 14, hwid };
  }
  return invoke("check_license", { hwid });
}
