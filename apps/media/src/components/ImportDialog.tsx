import { useEffect, useState } from "react";
import { Download, FolderOpen, Loader2, X } from "lucide-react";
import type { Song } from "../types";
import { startFromSharedProfile } from "../lib/shared-profiles";
import { useSongStore } from "../stores/song-store";
import { useMediaStore } from "../stores/media-store";
import { useBibleStore } from "../stores/bible-store";
import { makeSong, rtfToText } from "../lib/song-import";
import { openLpSong, songsFromFile } from "../lib/song-formats";
import { isDesktopApp } from "../lib/media-src";

interface Source { kind: "easyworship" | "openlp" | "files"; name: string; path: string; media: string[]; files: string[] }
interface Raw { title: string; author: string; copyright: string; words: string }

const call = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => (await import("@tauri-apps/api/core")).invoke<T>(cmd, args);
const ext = (p: string) => (/\.([a-z0-9]+)$/i.exec(p.split(/[\\/]/).pop()!)?.[1] ?? "").toLowerCase();

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
  if (s.kind === "files") return readFiles(s.files);
  if (s.kind === "openlp") return (await call<Raw[]>("import_openlp", { path: s.path })).map((x) => { try { return openLpSong(x.title, x.author, x.words); } catch { return null; } }).filter((x): x is Song => !!x);
  return (await call<Raw[]>("import_easyworship", { folder: s.path })).map((x) => makeSong(x.title, x.author, rtfToText(x.words), ["easyworship"]));
}

/** Brings songs, pictures, videos and Bibles over from other church software, and puts them with what is here. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<{ s: Source; songs: Song[]; isNew: number }[] | null>(null);
  const [bibles, setBibles] = useState<string[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const counts = useSongStore.getState().countNew;

  useEffect(() => {
    if (!isDesktopApp()) { setSources([]); setError("Importing works in the installed app."); return; }
    (async () => {
      const list = await call<Source[]>("find_import_sources").catch(() => []);
      const out: { s: Source; songs: Song[]; isNew: number }[] = [];
      for (const s of list) {
        const songs = await songsOf(s).catch(() => []);
        if (songs.length || s.media.length) out.push({ s, songs, isNew: counts(songs) });
      }
      setSources(out);
      setBibles(await call<string[]>("list_easyworship_bibles").catch(() => []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = (k: string) => setOff((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function choose(folder: boolean) {
    setError("");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open(folder
      ? { directory: true, title: "Choose the folder the songs are in" }
      : { multiple: true, title: "Choose song files", filters: [{ name: "Songs", extensions: ["txt", "usr", "xml", "show", "pro", "pro5", "pro6", "cho", "crd", "chopro", "chordpro", "sng", "vpagd", "json"] }] });
    if (!picked) return;
    setBusy("Reading…");
    try {
      let s: Source;
      if (folder) {
        const path = String(picked);
        // An EasyWorship database folder, or a folder of song files.
        const ew = await songsOf({ kind: "easyworship", name: "", path, media: [], files: [] }).catch(() => []);
        s = ew.length
          ? { kind: "easyworship", name: "EasyWorship (chosen folder)", path, media: [], files: [] }
          : { kind: "files", name: path.split(/[\\/]/).pop()!, path, media: [], files: await call<string[]>("song_files_in", { folder: path }) };
      } else {
        const files = (Array.isArray(picked) ? picked : [picked]).map(String);
        s = { kind: "files", name: `${files.length} file${files.length === 1 ? "" : "s"}`, path: files[0], media: [], files };
      }
      const songs = await songsOf(s);
      if (!songs.length) setError("No songs WorshipHQ can read were found there.");
      else setSources((l) => [...(l ?? []), { s, songs, isNew: counts(songs) }]);
    } catch (e) {
      setError(String(e));
    }
    setBusy("");
  }

  async function run() {
    const said: string[] = [];
    for (const { s, songs } of sources ?? []) {
      if (songs.length && !off.has(`s${s.path}`)) {
        setBusy(`Songs from ${s.name}…`);
        const n = useSongStore.getState().addSongs(songs);
        said.push(`${n} new song${n === 1 ? "" : "s"} from ${s.name}${songs.length - n ? ` (${songs.length - n} were already here)` : ""}`);
      }
      if (s.media.length && !off.has(`m${s.path}`)) {
        setBusy("Copying pictures and videos…");
        const have = new Set(useMediaStore.getState().items.map((i) => i.name.toLowerCase()));
        const fresh = s.media.filter((p) => !have.has(p.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "").toLowerCase()));
        const n = fresh.length ? (await useMediaStore.getState().importPaths(fresh)).length : 0;
        said.push(`${n} picture${n === 1 ? "" : "s"}, videos and sounds from ${s.name}`);
      }
    }
    for (const b of bibles) {
      if (off.has(`b${b}`)) continue;
      const name = b.split(/[\\/]/).pop()!.replace(/\.ewb$/i, "");
      setBusy(`Bible: ${name}…`);
      await call("import_easyworship_bible", { path: b }).then(() => said.push(`Bible: ${name}`), (e) => said.push(`Bible ${name}: ${e}`));
    }
    if (bibles.length) useBibleStore.getState().loadPacks();
    setBusy("");
    setDone(said.length ? said : ["Nothing was ticked."]);
  }

  const row = (key: string, title: string, detail: string) => (
    <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-surface-4">
      <input type="checkbox" checked={!off.has(key)} onChange={() => flip(key)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
      <span><span className="block text-[14px] font-semibold text-ink">{title}</span><span className="block text-[12px] text-ink-muted">{detail}</span></span>
    </label>
  );
  const nothing = sources && !sources.length && !bibles.length;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onMouseDown={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Import" onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-2xl border border-line bg-surface-2 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line p-5">
          <div className="flex-1">
            <h3 className="text-[17px] font-bold text-ink">Import from other software</h3>
            <p className="text-[13px] text-ink-muted">Copied in with what you have. Nothing here is replaced, and the other software isn't changed.</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="rounded p-1 text-ink-faint hover:bg-surface-4 hover:text-ink"><X className="size-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {done ? (
            <ul className="space-y-1 p-2 text-[14px] text-ink">{done.map((x, i) => <li key={i}>✓ {x}</li>)}</ul>
          ) : !sources ? (
            <p className="flex items-center gap-2 p-3 text-[14px] text-ink-muted"><Loader2 className="size-4 whq-spin" /> Looking for EasyWorship, OpenLP, FreeShow, ProPresenter, OpenSong and VideoPsalm…</p>
          ) : (
            <>
              {sources.map(({ s, songs, isNew }) => (
                <div key={s.path}>
                  {songs.length > 0 && row(`s${s.path}`, `${s.name}: ${songs.length} songs`, isNew === songs.length ? "All new" : isNew ? `${isNew} new, ${songs.length - isNew} already here` : "All already here")}
                  {s.media.length > 0 && row(`m${s.path}`, `${s.name}: ${s.media.length} pictures, videos and sounds`, "Only use what your church has the right to show")}
                </div>
              ))}
              {bibles.map((b) => row(`b${b}`, `Bible: ${b.split(/[\\/]/).pop()!.replace(/\.ewb$/i, "")}`, "From EasyWorship, for this computer"))}
              {nothing && !error && <p className="p-3 text-[14px] text-ink-muted">No other church software was found on this computer. Choose the files or the folder yourself.</p>}
            </>
          )}
          {error && <p className="px-3 pt-2 text-[13px] font-semibold text-danger">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
          {done ? <span className="flex-1" /> : (
            <>
              <button onClick={() => choose(true)} disabled={!!busy || !isDesktopApp()} className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-40"><FolderOpen className="size-4" /> A folder…</button>
              <button onClick={() => choose(false)} disabled={!!busy || !isDesktopApp()} className="h-10 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-40">Song files…</button>
              <button onClick={() => { onClose(); startFromSharedProfile(); }} disabled={!!busy} className="h-10 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-40">From WorshipHQ…</button>
              <span className="flex-1 truncate text-right text-[12px] text-ink-muted">{busy}</span>
            </>
          )}
          {done
            ? <button onClick={onClose} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright">Done</button>
            : <button onClick={run} disabled={!!busy || !sources || !!nothing} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-40">{busy ? <Loader2 className="size-4 whq-spin" /> : <Download className="size-4" />} Import</button>}
        </div>
      </div>
    </div>
  );
}
