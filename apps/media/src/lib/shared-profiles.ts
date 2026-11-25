import { askText, pickOne, tell } from "../components/Dialogs";
import { apiBase } from "../components/StockLibrary";
import { serverHeaders } from "./account";
import { isDesktopApp } from "./media-src";
import { NOTE_LOOK, type NoteLook } from "./note-doc";
import { createProfile, currentProfile, listProfiles, saveCurrentProfile } from "./profiles";
import { useNotesStore } from "../stores/notes-store";
import { useSongStore } from "../stores/song-store";
import { useThemeStore } from "../stores/theme-store";
import type { Song } from "../types";

/** Template profiles: songs and looks to start from, shared by WorshipHQ (Profiles › Templates from WorshipHQ). */
interface Content { name: string; songs: Omit<Song, "id">[]; looks: Record<string, unknown> | null; noteLook: Partial<NoteLook> | null }

/** The looks without pictures, videos or cameras, which are only on this computer. */
function portableLooks() {
  const { themes, transition } = useThemeStore.getState();
  const copy = JSON.parse(JSON.stringify(themes)) as Record<string, { background?: { kind: string; value: string; dim: number } }>;
  for (const t of Object.values(copy)) {
    if (t.background && t.background.kind !== "color" && t.background.kind !== "gradient") t.background = { kind: "color", value: "#000000", dim: 0 };
  }
  return { themes: copy, transition };
}

/** Profiles › Save this profile as a file. The built-in hymns are left out: every church has them. */
export async function saveProfileFile(): Promise<void> {
  if (!isDesktopApp()) { await tell("Saving works in the installed app."); return; }
  const songs = useSongStore.getState().songs.filter((s) => !s.id.startsWith("hymn-") && s.sections.some((x) => x.lyrics.trim())).map(({ id: _id, background: _bg, ...s }) => s);
  const name = await askText(`It will have your ${songs.length} songs and your looks and fonts. Pictures, videos, notes and schedules are not in it.`, currentProfile() === "Default" ? "" : currentProfile(), { title: "Save this profile as a file", placeholder: "Name", yes: "Save" });
  if (!name) return;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ title: "Save the profile", defaultPath: `${name.replace(/[\\/:*?"<>|]+/g, " ").trim()}.whqprofile`, filters: [{ name: "WorshipHQ profile", extensions: ["whqprofile"] }] });
  if (!path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const file = { app: "WorshipHQ Live", kind: "profile", version: 1, name: name.slice(0, 40), songs, looks: portableLooks(), noteLook: useNotesStore.getState().look };
  await invoke("write_text_file", { path, text: JSON.stringify(file) }).then(() => tell("Saved."), (e) => tell(String(e)));
}

/** Puts a template's songs and looks in. Yours stay: the looks become a profile of their own. */
async function use(p: Content): Promise<void> {
  const added = useSongStore.getState().addSongs((p.songs ?? []).map((s) => ({ ...s, id: crypto.randomUUID() }) as Song));
  let made = "";
  const looks = p.looks as { themes?: object; transition?: object } | null;
  if (looks?.themes) {
    made = p.name;
    for (let i = 2; listProfiles().includes(made); i++) made = `${p.name} ${i}`;
    createProfile(made);
    const t = useThemeStore.getState();
    useThemeStore.setState({ themes: { ...t.themes, ...looks.themes }, transition: { ...t.transition, ...looks.transition } } as Partial<typeof t>);
    saveCurrentProfile();
  }
  if (p.noteLook) useNotesStore.getState().setLook({ ...NOTE_LOOK, ...p.noteLook });
  const had = (p.songs?.length ?? 0) - added;
  await tell([
    p.songs?.length ? `${added} song${added === 1 ? "" : "s"} added${had ? ` (${had} were already here)` : ""}.` : "",
    made ? `The looks are in the profile “${made}”, which is on now. Go back to yours in the Profiles menu.` : "",
  ].filter(Boolean).join("\n\n"), p.name);
}

async function get<T>(path: string): Promise<T | null> {
  const lic = await serverHeaders();
  if (!lic) { await tell("Sign in first (Help › WorshipHQ account)."); return null; }
  let error = "The templates couldn't be reached. Check the internet.";
  try {
    const res = await fetch(`${apiBase()}/api/media/profiles${path}`, { headers: lic, signal: AbortSignal.timeout(30000) });
    const body = (await res.json()) as T & { error?: string };
    if (res.ok) return body;
    error = body.error ?? error;
  } catch { /* offline */ }
  await tell(error);
  return null;
}

export async function startFromSharedProfile(): Promise<void> {
  const out = await get<{ profiles: { id: string; name: string; about: string; songs: number; looks: boolean }[] }>("");
  if (!out) return;
  if (!out.profiles?.length) { await tell("There are no templates yet. They will appear here when WorshipHQ shares some."); return; }
  const id = await pickOne("Its songs are added to yours. Your own songs and settings stay.", out.profiles.map((p) => ({ id: p.id, label: p.name, detail: [p.songs ? `${p.songs} songs` : "", p.looks ? "looks and fonts" : "", p.about].filter(Boolean).join(" · ") })), "Templates from WorshipHQ");
  if (!id) return;
  const one = await get<{ profile: Content }>(`?id=${encodeURIComponent(id)}`);
  if (one?.profile) await use(one.profile);
}
