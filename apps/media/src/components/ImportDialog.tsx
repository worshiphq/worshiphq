import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FolderOpen, Loader2, X } from "lucide-react";
import type { Song } from "../types";
import { startFromSharedProfile } from "../lib/shared-profiles";
import { useSongStore } from "../stores/song-store";
import { useMediaStore } from "../stores/media-store";
import { useBibleStore } from "../stores/bible-store";
import { makeSong, rtfToText } from "../lib/song-import";
import { openLpSong, songsFromFile } from "../lib/song-formats";
import { createProfile, listProfiles } from "../lib/profiles";
import { isDesktopApp } from "../lib/media-src";

interface Source {
  kind: "easyworship" | "openlp" | "files"; name: string; path: string; media: string[]; files: string[]; decks: string[];
  /** The EasyWorship profile (.ewp) it came from. */
  profile?: string | null;
  /** A profile whose folder isn't on this computer: where it should be. */
  missing?: string | null;
}
interface Raw { title: string; author: string; copyright: string; words: string }
interface Found { s: Source; songs: Song[]; fresh: Set<string> }
/** One thing that can be brought over. */
interface Item { id: string; label: string; note?: string }
interface Group { id: string; title: string; note?: string; items: Item[]; run: (ids: Set<string>) => Promise<string> }

const call = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => (await import("@tauri-apps/api/core")).invoke<T>(cmd, args);
const fileName = (p: string) => p.split(/[\\/]/).pop()!;
const ext = (p: string) => (/\.([a-z0-9]+)$/i.exec(fileName(p))?.[1] ?? "").toLowerCase();
const bare = (p: string) => fileName(p).replace(/\.[^.]+$/, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const blank = { media: [], files: [], decks: [] };

async function readFiles(paths: string[]): Promise<Song[]> {
  const out: Song[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const part = paths.slice(i, i + 100);
    const files = await call<{ name: string; text: string }[]>("read_text_files", { paths: part });
    files.forEach((f, k) => out.push(...songsFromFile(f.name, ext(part[k]), f.text)));
  }
  return out;
}

async function songsOf(s: Source): Promise<Song[]> {
  if (s.missing) return [];
  if (s.kind === "files") return readFiles(s.files);
  if (s.kind === "openlp") return (await call<Raw[]>("import_openlp", { path: s.path })).map((x) => { try { return openLpSong(x.title, x.author, x.words); } catch { return null; } }).filter((x): x is Song => !!x);
  return (await call<Raw[]>("import_easyworship", { folder: s.path })).map((x) => makeSong(x.title, x.author, rtfToText(x.words), ["easyworship"]));
}

async function look(s: Source): Promise<Found> {
  const songs = (await songsOf(s).catch(() => [])).sort((a, b) => a.title.localeCompare(b.title));
  // Which are new (compared one by one, so a song in here twice counts once).
  return { s, songs, fresh: new Set(useSongStore.getState().newSongs(songs).map((x) => x.id)) };
}

/** Copies media in, skipping names that are already in the library. */
async function addMedia(paths: string[], kind: string): Promise<string> {
  const have = new Set(useMediaStore.getState().items.map((i) => i.name.toLowerCase()));
  const fresh = paths.filter((p) => !have.has(bare(p).toLowerCase()));
  const n = fresh.length ? (await useMediaStore.getState().importPaths(fresh)).length : 0;
  return `${n} ${kind}${paths.length - n ? ` (${paths.length - n} were already here or couldn't be read)` : ""}`;
}

function groupsOf({ s, songs, fresh }: Found): Group[] {
  const out: Group[] = [];
  if (songs.length) {
    out.push({
      id: `${s.path}|songs`, title: plural(songs.length, "song"), note: fresh.size === songs.length ? "All new" : fresh.size ? `${fresh.size} new` : "All already here",
      items: songs.map((x) => ({ id: x.id, label: x.title, note: fresh.has(x.id) ? x.author : "Already here" })),
      run: async (ids) => {
        const picked = songs.filter((x) => ids.has(x.id));
        const n = useSongStore.getState().addSongs(picked);
        return `${plural(n, "new song")}${picked.length - n ? ` (${picked.length - n} were already here)` : ""}`;
      },
    });
  }
  const media = (re: RegExp, one: string, many: string) => {
    const list = s.media.filter((p) => re.test(p));
    if (list.length) out.push({ id: `${s.path}|${many}`, title: plural(list.length, one, many), note: "Only use what your church may show", items: list.map((p) => ({ id: p, label: fileName(p) })), run: (ids) => addMedia(list.filter((p) => ids.has(p)), many) });
  };
  media(/\.(jpe?g|png|bmp|gif|webp)$/i, "picture", "pictures");
  media(/\.(mp4|m4v|mov|webm)$/i, "video", "videos");
  media(/\.(mp3|wav|m4a)$/i, "sound", "sounds");
  if (s.decks.length) {
    out.push({
      id: `${s.path}|decks`, title: plural(s.decks.length, "presentation"), note: "PowerPoint and PDF; each takes a little while", items: s.decks.map((p) => ({ id: p, label: fileName(p) })),
      run: async (ids) => {
        let n = 0;
        const list = s.decks.filter((p) => ids.has(p));
        for (const p of list) if (await useMediaStore.getState().importPresentation(p)) n++;
        return `${plural(n, "presentation")}${list.length - n ? ` (${list.length - n} couldn't be read)` : ""}`;
      },
    });
  }
  return out;
}

/** Brings songs, pictures, videos and Bibles over from other church software, and puts them with what is here. */
export function ImportDialog({ onClose, openProfile = false }: { onClose: () => void; /** Start by choosing an EasyWorship profile. */ openProfile?: boolean }) {
  const [found, setFound] = useState<Found[] | null>(null);
  const [bibles, setBibles] = useState<string[]>([]);
  /** What is not wanted: "group|item". */
  const [off, setOff] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const asked = useRef(false);

  /** Puts sources first in the list (instead of the same ones lower down) and unticks what is here already. */
  async function add(list: Source[], first: boolean) {
    const next: Found[] = [];
    for (const s of list) {
      const f = await look(s);
      if (f.s.missing || groupsOf(f).length) next.push(f);
    }
    setOff((o) => {
      const n = new Set(o);
      for (const f of next) for (const x of f.songs) if (!f.fresh.has(x.id)) n.add(`${f.s.path}|songs|${x.id}`);
      return n;
    });
    const same = (f: Found) => next.some((x) => x.s.path.toLowerCase() === f.s.path.toLowerCase());
    setFound((l) => (first ? [...next, ...(l ?? []).filter((f) => !same(f))] : [...(l ?? []).filter((f) => !same(f)), ...next]));
    return next;
  }

  useEffect(() => {
    if (!isDesktopApp()) { setFound([]); setError("Importing works in the installed app."); return; }
    if (asked.current) return;
    asked.current = true;
    (async () => {
      if (openProfile) { setFound([]); await chooseProfile(); return; }
      const list = await call<Source[]>("find_import_sources").catch(() => []);
      await add(list, false);
      setBibles(await call<string[]>("list_easyworship_bibles").catch(() => []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPath = async (o: Record<string, unknown>) => (await import("@tauri-apps/plugin-dialog")).open(o as never) as Promise<string | string[] | null>;
  async function reading(f: () => Promise<void>) {
    setError("");
    setBusy("Reading…");
    try { await f(); } catch (e) { setError(String(e)); }
    setBusy("");
  }

  async function chooseProfile() {
    const picked = await pickPath({ multiple: false, title: "Open an EasyWorship profile", filters: [{ name: "EasyWorship profile", extensions: ["ewp"] }] });
    if (!picked) return;
    await reading(async () => {
      const got = await add(await call<Source[]>("easyworship_profile", { path: String(picked) }), true);
      if (!got.length) setError("That profile's folder is here, but it has no songs or media in it.");
    });
  }

  /** The folder of a profile that has moved. */
  async function findFolder(f: Found) {
    const picked = await pickPath({ directory: true, title: `Find the folder of “${f.s.profile}” (it has Databases and Resources in it)` });
    if (!picked) return;
    await reading(async () => {
      const list = await call<Source[]>("easyworship_in", { folder: String(picked), label: ` · ${f.s.profile}` });
      if (!list.length) { setError("No EasyWorship songs or media were found in that folder."); return; }
      setFound((l) => (l ?? []).filter((x) => x.s.path !== f.s.path));
      await add(list.map((s) => ({ ...s, profile: f.s.profile })), true);
    });
  }

  async function choose(folder: boolean) {
    const picked = await pickPath(folder
      ? { directory: true, title: "Choose the folder the songs are in" }
      : { multiple: true, title: "Choose song files", filters: [{ name: "Songs", extensions: ["txt", "usr", "xml", "show", "pro", "pro5", "pro6", "cho", "crd", "chopro", "chordpro", "sng", "vpagd", "json"] }] });
    if (!picked) return;
    await reading(async () => {
      let list: Source[];
      if (folder) {
        const path = String(picked);
        // An EasyWorship folder, or a folder of song files.
        list = await call<Source[]>("easyworship_in", { folder: path, label: "" });
        if (!list.length) list = [{ ...blank, kind: "files", name: fileName(path), path, files: await call<string[]>("song_files_in", { folder: path }) }];
      } else {
        const files = (Array.isArray(picked) ? picked : [picked]).map(String);
        list = [{ ...blank, kind: "files", name: plural(files.length, "file"), path: files[0], files }];
      }
      if (!(await add(list, true)).length) setError("No songs WorshipHQ can read were found there.");
    });
  }

  const sections = useMemo(() => {
    const out: { title: string; found?: Found; groups: Group[] }[] = (found ?? []).map((f) => ({ title: f.s.name, found: f, groups: groupsOf(f) }));
    const names = [...new Set((found ?? []).filter((f) => f.s.profile && !f.s.missing).map((f) => f.s.profile!))].filter((n) => !listProfiles().includes(n.slice(0, 40)));
    for (const n of names) {
      const i = out.findIndex((x) => x.found?.s.profile === n);
      out[i].groups = [...out[i].groups, { id: `profile|${n}`, title: `A profile called “${n}”`, note: "Starts with the looks you have now", items: [{ id: n, label: n }], run: async () => { createProfile(n); return `the profile “${n}”, which is on now`; } }];
    }
    if (bibles.length) out.push({ title: "EasyWorship Bibles", groups: [{
      id: "bibles", title: plural(bibles.length, "Bible"), note: "For this computer", items: bibles.map((b) => ({ id: b, label: bare(b) })),
      run: async (ids) => {
        let n = 0;
        for (const b of bibles.filter((x) => ids.has(x))) { setBusy(`Bible: ${bare(b)}…`); await call("import_easyworship_bible", { path: b }).then(() => n++, () => {}); }
        useBibleStore.getState().loadPacks();
        return plural(n, "Bible");
      },
    }] });
    return out;
  }, [found, bibles]);

  const key = (g: Group, i: Item) => `${g.id}|${i.id}`;
  const wanted = (g: Group) => g.items.filter((i) => !off.has(key(g, i)));
  const flip = (g: Group, items: Item[], on: boolean) => setOff((o) => { const n = new Set(o); for (const i of items) if (on) n.delete(key(g, i)); else n.add(key(g, i)); return n; });
  const total = sections.reduce((n, x) => n + x.groups.reduce((m, g) => m + wanted(g).length, 0), 0);

  async function run() {
    const said: string[] = [];
    for (const { title, groups } of sections) for (const g of groups) {
      const want = wanted(g);
      if (!want.length) continue;
      setBusy(`${title}: ${g.title}…`);
      try { said.push(`${title}: ${await g.run(new Set(want.map((i) => i.id)))}`); } catch (e) { said.push(`${title}: ${e}`); }
    }
    setBusy("");
    setDone(said);
  }

  const button = "h-9 rounded-lg px-2.5 text-[13px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink disabled:opacity-40";
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onMouseDown={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Import" onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface-2 shadow-2xl">
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="flex-1">
            <h3 className="text-[18px] font-bold text-ink">Import</h3>
            <p className="text-[13px] text-ink-muted">Choose what you want. It is copied in with what you have; nothing here is replaced.</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="rounded p-1 text-ink-faint hover:bg-surface-4 hover:text-ink"><X className="size-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-5 py-3">
          {done ? (
            <ul className="space-y-1 text-[14px] text-ink">{done.map((x, i) => <li key={i}>✓ {x}</li>)}</ul>
          ) : !found ? (
            <p className="flex items-center gap-2 py-3 text-[14px] text-ink-muted"><Loader2 className="size-4 whq-spin" /> Looking for EasyWorship and its profiles, OpenLP, FreeShow, ProPresenter, OpenSong and VideoPsalm…</p>
          ) : sections.length === 0 && !error ? (
            <p className="py-3 text-[14px] text-ink-muted">{openProfile ? "Choose an EasyWorship profile (a .ewp file)." : "No other church software was found. Open an EasyWorship profile, or choose a folder or files."}</p>
          ) : sections.map(({ title, found: f, groups }) => (
            <section key={f?.s.path ?? title} className="mb-4 last:mb-0">
              <h4 className="mb-1 text-[14px] font-bold text-ink">{title}</h4>
              {f?.s.missing && (
                <div className="rounded-xl bg-gold/10 p-3 text-[13px] text-ink">
                  This profile only says where its songs are, and that folder isn't on this computer:
                  <span className="mt-1 block break-all font-mono text-[12px] text-ink-muted">{f.s.missing}</span>
                  <span className="mt-1 block">Open it on the EasyWorship computer, or plug in or copy that folder and press Find the folder.</span>
                  <button onClick={() => findFolder(f)} disabled={!!busy} className="mt-2 flex h-9 items-center gap-2 rounded-lg border border-line-bright bg-surface-2 px-3 font-semibold hover:bg-surface-4"><FolderOpen className="size-4" /> Find the folder…</button>
                </div>
              )}
              {groups.map((g) => {
                const want = wanted(g), isOpen = open === g.id;
                const shown = isOpen ? g.items.filter((i) => i.label.toLowerCase().includes(filter.trim().toLowerCase())) : [];
                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-surface-4">
                      <input type="checkbox" aria-label={g.title} checked={want.length > 0} ref={(x) => { if (x) x.indeterminate = want.length > 0 && want.length < g.items.length; }} onChange={() => flip(g, g.items, want.length === 0)} className="size-4 accent-[var(--color-primary)]" />
                      <button onClick={() => { setOpen(isOpen ? "" : g.id); setFilter(""); }} disabled={g.items.length < 2} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <span className="text-[14px] font-semibold text-ink">{g.title}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{want.length > 0 && want.length < g.items.length ? `${want.length} chosen` : g.note}</span>
                        {g.items.length > 1 && <ChevronRight className={`size-4 text-ink-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="mb-2 ml-7 rounded-xl border border-line">
                        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
                          <input value={filter} onChange={(x) => setFilter(x.target.value)} placeholder="Search" aria-label="Search" className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" />
                          <button onClick={() => flip(g, shown, true)} className="text-[12px] font-semibold text-primary-bright hover:underline">All</button>
                          <button onClick={() => flip(g, shown, false)} className="text-[12px] font-semibold text-primary-bright hover:underline">None</button>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-1.5">
                          {shown.map((i) => (
                            <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-surface-4">
                              <input type="checkbox" checked={!off.has(key(g, i))} onChange={() => flip(g, [i], off.has(key(g, i)))} className="size-3.5 shrink-0 accent-[var(--color-primary)]" />
                              <span className="truncate text-ink">{i.label}</span>{i.note && <span className="truncate text-[12px] text-ink-faint">{i.note}</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
          {error && <p className="pt-2 text-[13px] font-semibold text-danger">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t border-line p-3 pl-4">
          {!done && (
            <>
              <button onClick={chooseProfile} disabled={!!busy || !isDesktopApp()} className={button}>EasyWorship profile…</button>
              <button onClick={() => choose(true)} disabled={!!busy || !isDesktopApp()} className={button}>Folder…</button>
              <button onClick={() => choose(false)} disabled={!!busy || !isDesktopApp()} className={button}>Files…</button>
              <button onClick={() => { onClose(); startFromSharedProfile(); }} disabled={!!busy} className={button}>From WorshipHQ…</button>
            </>
          )}
          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-ink-muted">{busy}</span>
          {done
            ? <button onClick={onClose} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright">Done</button>
            : <button onClick={run} disabled={!!busy || !total} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-40">{busy ? <Loader2 className="size-4 whq-spin" /> : <Download className="size-4" />} Import</button>}
        </div>
      </div>
    </div>
  );
}
