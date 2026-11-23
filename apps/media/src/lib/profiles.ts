/**
 * Profiles, like EasyWorship: each person (or each kind of service) keeps their own looks, fonts, transitions,
 * voice settings and second Bible version. Switching saves the current one and loads the other.
 */
const KEYS = ["whq-media-looks", "whq-media-voice", "whq-second-version", "whq-songs-autosave"];
const STORE = "whq-profiles";
const CURRENT = "whq-profile-current";

type Saved = Record<string, Record<string, string | null>>;

function read(): Saved {
  try { return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Saved; } catch { return {}; }
}
function write(all: Saved) {
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* ignore */ }
}
function snapshot(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of KEYS) { try { out[k] = localStorage.getItem(k); } catch { out[k] = null; } }
  return out;
}

export function currentProfile(): string {
  try { return localStorage.getItem(CURRENT) || "Default"; } catch { return "Default"; }
}

export function listProfiles(): string[] {
  const names = new Set(Object.keys(read()));
  names.add("Default");
  names.add(currentProfile());
  return [...names].sort((a, b) => (a === "Default" ? -1 : b === "Default" ? 1 : a.localeCompare(b)));
}

/** Saves the settings in use now under the current profile. */
export function saveCurrentProfile() {
  const all = read();
  all[currentProfile()] = snapshot();
  write(all);
}

/** Saves the current profile, loads another, and restarts the screens so it takes effect. */
export function switchProfile(name: string) {
  if (name === currentProfile()) return;
  saveCurrentProfile();
  const all = read();
  const next = all[name];
  for (const k of KEYS) {
    try {
      const v = next?.[k];
      if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch { /* ignore */ }
  }
  try { localStorage.setItem(CURRENT, name); } catch { /* ignore */ }
  window.location.reload();
}

/** A new profile starts as a copy of the current settings. */
export function createProfile(name: string) {
  const n = name.trim().slice(0, 40);
  if (!n) return;
  saveCurrentProfile();
  const all = read();
  all[n] = snapshot();
  write(all);
  try { localStorage.setItem(CURRENT, n); } catch { /* ignore */ }
}

export function deleteProfile(name: string) {
  if (name === "Default") return;
  const all = read();
  delete all[name];
  write(all);
  if (currentProfile() === name) switchProfile("Default");
}
