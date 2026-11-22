import { useEffect, useMemo, useRef, useState } from "react";
import { SongToolbar } from "./SongToolbar";
import { cssFont } from "../lib/rich-text";
import { Check, HelpCircle, Music, Plus, Search, Trash2, X } from "lucide-react";
import { useSongStore } from "../stores/song-store";
import { useProjectionStore } from "../stores/projection-store";
import { buildSongSlides, songToServiceItem } from "../lib/song-slides";
import { NEW_SONG_TEXT, songToText, textToSections } from "../lib/song-text";
import type { Song } from "../types";
import { SlidePreview } from "./SlidePreview";
import { useContextMenu } from "./ContextMenu";
import { Copy as CopyIcon, MonitorPlay, Download, FileText, Loader2 } from "lucide-react";
import { makeSong, rtfToText, songFromTextFile } from "../lib/song-import";

export function SongsView() {
  const { songs, filteredSongs, searchQuery, loadSongs, search, addSong, addSongs, updateSong, deleteSong } = useSongStore();
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const desktop = !!(window as any).__TAURI_INTERNALS__;

  async function importFromEasyWorship() {
    setImportOpen(false);
    if (!desktop) { setToast("Importing works in the installed app."); return; }
    setImporting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      let folder = await invoke<string | null>("find_easyworship");
      if (!folder) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({ directory: true, title: "Find EasyWorship's Databases\\Data folder (it has Songs.db in it)" });
        if (!picked) { setImporting(false); return; }
        folder = String(picked);
      }
      const list = await invoke<{ title: string; author: string; copyright: string; words: string }[]>("import_easyworship", { folder });
      const added = addSongs(list.map((x) => makeSong(x.title, x.author, rtfToText(x.words), ["easyworship"])));
      setToast(`Imported ${added} new song${added === 1 ? "" : "s"} from EasyWorship (${list.length - added} were already here)`);
    } catch (e) {
      setToast(`Couldn't import from EasyWorship: ${e}`);
    }
    setImporting(false);
  }

  async function importTextFiles() {
    setImportOpen(false);
    if (!desktop) { setToast("Importing works in the installed app."); return; }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ multiple: true, title: "Choose song files", filters: [{ name: "Song text files", extensions: ["txt", "usr"] }] });
      if (!picked) return;
      setImporting(true);
      const { invoke } = await import("@tauri-apps/api/core");
      const files = await invoke<{ name: string; text: string }[]>("read_text_files", { paths: (Array.isArray(picked) ? picked : [picked]).map(String) });
      const parsed = files.map((f) => songFromTextFile(f.name, f.text)).filter((x): x is Song => !!x);
      const added = addSongs(parsed);
      setToast(`Imported ${added} song${added === 1 ? "" : "s"}`);
    } catch (e) {
      setToast(`Couldn't import: ${e}`);
    }
    setImporting(false);
  }
  const { addToService, goLive, serviceItems, projectionOpen, openProjection } = useProjectionStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const wordsRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const menu = useContextMenu();

  useEffect(() => { loadSongs(); }, [loadSongs]);
  useEffect(() => {
    if (!selectedId && songs.length) setSelectedId(songs[0].id);
  }, [selectedId, songs]);

  const song = songs.find((s) => s.id === selectedId) ?? null;

  // Load the words when a different song is chosen.
  useEffect(() => {
    if (song) setText(songToText(song));
    setConfirmDelete(false);
    setSaved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const slides = useMemo(() => (song ? buildSongSlides(song) : []), [song]);
  const inService = !!song && serviceItems.some((i) => i.data?.songId === song.id);

  function changeWords(value: string) {
    setText(value);
    setSaved(false);
    window.clearTimeout(saveTimer.current);
    const id = selectedId;
    saveTimer.current = window.setTimeout(() => {
      if (!id) return;
      updateSong(id, textToSections(value));
      setSaved(true);
    }, 400);
  }

  function newSong() {
    const s: Song = {
      id: crypto.randomUUID(),
      title: "New song",
      author: "",
      key: "",
      tags: [],
      ...textToSections(NEW_SONG_TEXT),
    };
    search("");
    addSong(s);
    setSelectedId(s.id);
    setText(NEW_SONG_TEXT);
    setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select(); }, 50);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px] xl:overflow-hidden">
      {/* ─── Song list ─── */}
      <section className="flex min-h-0 flex-col rounded-xl border border-line bg-surface-2 p-3 shadow-sm max-xl:min-h-[560px]">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">Songs</h3>
          <span className="text-[12px] text-ink-muted">{songs.length}</span>
        </div>
        <div className="relative mb-2 grid grid-cols-2 gap-2">
          <button onClick={newSong} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-bold text-white hover:bg-primary-bright">
            <Plus className="size-4" /> New song
          </button>
          <button onClick={() => setImportOpen((o) => !o)} disabled={importing} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line-bright text-[14px] font-semibold text-ink hover:bg-surface-4">
            {importing ? <Loader2 className="size-4 whq-spin" /> : <Download className="size-4" />} Import
          </button>
          {importOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-line-bright bg-surface-2 py-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
              <button onClick={importFromEasyWorship} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-primary-soft">
                <Download className="mt-0.5 size-4 text-ink-muted" />
                <span><span className="block text-[14px] font-semibold text-ink">From EasyWorship 6 or 7</span><span className="block text-[12px] text-ink-muted">Finds EasyWorship on this computer and copies its songs</span></span>
              </button>
              <button onClick={importTextFiles} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-primary-soft">
                <FileText className="mt-0.5 size-4 text-ink-muted" />
                <span><span className="block text-[14px] font-semibold text-ink">From song text files</span><span className="block text-[12px] text-ink-muted">.txt files, including SongSelect lyrics downloads</span></span>
              </button>
            </div>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            placeholder="Search titles and words"
            aria-label="Search songs"
            className="h-9 w-full rounded-lg border border-line-bright pl-9 pr-8 text-[14px] text-ink outline-none focus:border-primary"
          />
          {searchQuery && (
            <button onClick={() => search("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {filteredSongs.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              onContextMenu={menu.open(() => [
                { label: "Show on screen", icon: <MonitorPlay className="size-4" />, onClick: () => { const first = buildSongSlides(s)[0]; if (first) { if ((window as any).__TAURI_INTERNALS__ && !projectionOpen) openProjection(); goLive(first); } } },
                { label: "Add to service", icon: <Plus className="size-4" />, onClick: () => { addToService(songToServiceItem(s)); setToast(`${s.title} added to the service`); } },
                { label: "Edit", icon: <Music className="size-4" />, onClick: () => setSelectedId(s.id) },
                { label: "Make a copy", icon: <CopyIcon className="size-4" />, onClick: () => { const c = { ...JSON.parse(JSON.stringify(s)), id: crypto.randomUUID(), title: `${s.title} (copy)` }; addSong(c); setSelectedId(c.id); } },
                { divider: true },
                { label: "Delete", icon: <Trash2 className="size-4" />, danger: true, onClick: () => { deleteSong(s.id); if (selectedId === s.id) setSelectedId(null); } },
              ])}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${s.id === selectedId ? "bg-primary-soft" : "hover:bg-surface-4"}`}
            >
              <Music className={`size-4 shrink-0 ${s.id === selectedId ? "text-primary-bright" : "text-ink-faint"}`} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink">{s.title || "Untitled song"}</span>
                {s.author && <span className="block truncate text-[12px] text-ink-muted">{s.author}</span>}
              </span>
            </button>
          ))}
          {filteredSongs.length === 0 && <p className="py-6 text-center text-[13px] text-ink-muted">No songs match “{searchQuery}”.</p>}
        </div>
      </section>

      {menu.element}
      {/* ─── Editor ─── */}
      <section className="flex min-h-0 flex-col rounded-xl border border-line bg-surface-2 shadow-sm max-xl:min-h-[560px]">
        {!song ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <Music className="mx-auto size-10 text-ink-faint" />
              <p className="mt-3 text-[16px] font-semibold text-ink">No songs yet</p>
              <p className="mt-1 text-[14px] text-ink-muted">Press “New song” and paste in the words.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-line p-4">
              <input
                ref={titleRef}
                value={song.title}
                onChange={(e) => updateSong(song.id, { title: e.target.value })}
                placeholder="Song title"
                aria-label="Song title"
                className="w-full rounded-md bg-transparent px-1 text-[22px] font-bold text-ink outline-none hover:bg-surface-4 focus:bg-surface-4"
              />
              <div className="mt-2 flex flex-wrap gap-3">
                <Field label="Written by" value={song.author ?? ""} onChange={(v) => updateSong(song.id, { author: v })} placeholder="e.g. Chris Tomlin" width="w-64" />
                <Field label="Key" value={song.key ?? ""} onChange={(v) => updateSong(song.id, { key: v })} placeholder="G" width="w-20" />
                <span className="ml-auto self-end text-[12px] text-ink-faint">{saved ? "✓ Saved" : "Saving…"}</span>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">Words</span>
                <button onClick={() => setShowHelp((h) => !h)} className="flex items-center gap-1 text-[13px] font-medium text-primary-bright hover:underline">
                  <HelpCircle className="size-4" /> How to write the words
                </button>
              </div>
              {showHelp && (
                <div className="mb-2 rounded-lg bg-primary-soft/60 p-3 text-[13px] leading-relaxed text-ink">
                  Put each part under a heading in square brackets, like <code className="rounded bg-surface-2 px-1">[Verse 1]</code>,{" "}
                  <code className="rounded bg-surface-2 px-1">[Chorus]</code> or <code className="rounded bg-surface-2 px-1">[Bridge]</code>.
                  Leave an empty line to start a new slide. To sing the chorus again, just write <code className="rounded bg-surface-2 px-1">[Chorus]</code> again with nothing under it.
                </div>
              )}
              <SongToolbar song={song} text={text} setText={changeWords} area={wordsRef} onChange={(c) => updateSong(song.id, c)} />
              <textarea
                ref={wordsRef}
                value={text}
                onChange={(e) => changeWords(e.target.value)}
                spellCheck={false}
                aria-label="Song words"
                placeholder={"[Verse 1]\nType or paste the words here…"}
                className="min-h-0 flex-1 resize-none rounded-lg border border-line-bright bg-surface-2 p-3 font-mono text-[14px] leading-relaxed text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-glow"
                style={{ userSelect: "text", ...(song.font ? { fontFamily: cssFont(song.font), fontSize: 16 } : {}) }}
              />
            </div>
          </>
        )}
      </section>

      {/* ─── Slides + actions ─── */}
      <div className="flex min-h-0 flex-col gap-3 lg:col-span-2 xl:col-span-1 xl:overflow-y-auto">
        {song && (
          <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { addToService(songToServiceItem(song)); setToast(`${song.title} added to the service`); }}
                disabled={!slides.length}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[16px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint"
              >
                <Plus className="size-5" /> Add to service
              </button>
              {inService && <p className="text-center text-[13px] text-primary-bright">This song is already in the service</p>}
              {toast && (
                <p role="status" className="fade-in flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] font-medium text-success">
                  <Check className="size-4" /> {toast}
                </p>
              )}
              {confirmDelete ? (
                <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-ink">
                  <span className="flex-1">Delete “{song.title}”?</span>
                  <button onClick={() => { deleteSong(song.id); setSelectedId(null); }} className="rounded-md bg-danger px-2.5 py-1 font-semibold text-white">Delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 font-semibold text-ink-muted hover:bg-surface-4">Keep</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-4" /> Delete song
                </button>
              )}
            </div>
          </section>
        )}

        {song && (
          <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">Slides</h3>
              <span className="text-[12px] text-ink-muted">{slides.length} · click one to show it</span>
            </div>
            <div className="space-y-3">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { if ((window as any).__TAURI_INTERNALS__ && !projectionOpen) openProjection(); goLive(s); }}
                  className="block w-full rounded-lg p-1 text-left hover:bg-surface-4"
                  title="Show this slide on screen now"
                >
                  <SlidePreview slide={s} />
                  <div className="mt-1 px-0.5 text-[13px] font-semibold text-ink">{i + 1}. {s.label}</div>
                </button>
              ))}
              {!slides.length && <p className="py-6 text-center text-[13px] text-ink-muted">Type the words and the slides appear here.</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, width }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; width: string }) {
  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-[12px] font-medium text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-line-bright px-2.5 text-[14px] text-ink outline-none focus:border-primary"
      />
    </label>
  );
}
