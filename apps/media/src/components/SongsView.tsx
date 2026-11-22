import { useEffect, useMemo, useRef, useState } from "react";
import { SongEditorDialog } from "./SongEditorDialog";
import { Check, Music, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { richText } from "../lib/rich-text";
import { useSongStore } from "../stores/song-store";
import { useProjectionStore } from "../stores/projection-store";
import { buildSongSlides, songToServiceItem } from "../lib/song-slides";
import { NEW_SONG_TEXT, textToSections } from "../lib/song-text";
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
  const { addToService, goLive, serviceItems, projectionOpen, openProjection, currentSlide, isLive, isBlack } = useProjectionStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The slide picked in the middle (shown in the preview). */
  const [slideIndex, setSlideIndex] = useState(0);
  /** The song open in the edit window. */
  const [editing, setEditing] = useState<{ id: string; isNew: boolean; saved: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useContextMenu();

  useEffect(() => { loadSongs(); }, [loadSongs]);
  useEffect(() => {
    if (!selectedId && songs.length) setSelectedId(songs[0].id);
  }, [selectedId, songs]);

  const song = songs.find((s) => s.id === selectedId) ?? null;
  useEffect(() => { setSlideIndex(0); setConfirmDelete(false); }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const slides = useMemo(() => (song ? buildSongSlides(song) : []), [song]);
  const picked = slides[Math.min(slideIndex, slides.length - 1)] ?? null;
  const inService = !!song && serviceItems.some((i) => i.data?.songId === song.id);
  const liveText = isLive && !isBlack ? currentSlide?.content.primaryText : undefined;

  function showLive(i: number) {
    const s = slides[i];
    if (!s) return;
    setSlideIndex(i);
    if ((window as any).__TAURI_INTERNALS__ && !projectionOpen) openProjection();
    goLive(s);
  }

  function addSongToService(s: Song) {
    addToService(songToServiceItem(s));
    setToast(`${s.title} added to the service`);
  }

  function newSong() {
    const s: Song = { id: crypto.randomUUID(), title: "New song", author: "", key: "", tags: [], ...textToSections(NEW_SONG_TEXT) };
    search("");
    addSong(s);
    setSelectedId(s.id);
    setEditing({ id: s.id, isNew: true, saved: false });
  }

  const editSong = (id: string) => { setSelectedId(id); setEditing({ id, isNew: false, saved: true }); };
  const editingSong = editing ? songs.find((s) => s.id === editing.id) ?? null : null;

  // ↑ ↓ pick a slide, Enter (or double-click) shows it on screen.
  function onSlidesKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setSlideIndex((i) => Math.min(slides.length - 1, i + 1)); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setSlideIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); showLive(slideIndex); }
  }
  useEffect(() => {
    listRef.current?.querySelector(`[data-slide="${slideIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [slideIndex]);

  const songMenu = (s: Song) => menu.open(() => [
    { label: "Show on screen", icon: <MonitorPlay className="size-4" />, onClick: () => { const first = buildSongSlides(s)[0]; if (first) { if ((window as any).__TAURI_INTERNALS__ && !projectionOpen) openProjection(); goLive(first); } } },
    { label: "Add to service", icon: <Plus className="size-4" />, onClick: () => addSongToService(s) },
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: () => editSong(s.id) },
    { label: "Make a copy", icon: <CopyIcon className="size-4" />, onClick: () => { const c = { ...JSON.parse(JSON.stringify(s)), id: crypto.randomUUID(), title: `${s.title} (copy)` }; addSong(c); setSelectedId(c.id); } },
    { divider: true },
    { label: "Delete", icon: <Trash2 className="size-4" />, danger: true, onClick: () => { if (window.confirm(`Delete “${s.title}”? This can't be undone.`)) { deleteSong(s.id); if (selectedId === s.id) setSelectedId(null); } } },
  ]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_380px] xl:overflow-hidden">
      {menu.element}
      {/* ─── Song list ─── */}
      <section className="flex min-h-0 flex-col rounded-xl border border-line bg-surface-2 p-3 shadow-sm max-xl:min-h-[560px]">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">Songs</h3>
          <span className="text-[12px] text-ink-muted">{songs.length}</span>
        </div>
        <div className="relative mb-2 grid grid-cols-[1fr_auto_auto] gap-1.5">
          <button onClick={newSong} className="flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-2 text-[14px] font-bold text-white hover:bg-primary-bright">
            <Plus className="size-4" /> New song
          </button>
          <button onClick={() => song && editSong(song.id)} disabled={!song} title="Edit the selected song"
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line-bright px-2.5 text-[14px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-40">
            <Pencil className="size-4" /> Edit
          </button>
          <button onClick={() => setImportOpen((o) => !o)} disabled={importing} title="Import songs"
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line-bright px-2.5 text-[14px] font-semibold text-ink hover:bg-surface-4">
            {importing ? <Loader2 className="size-4 whq-spin" /> : <Download className="size-4" />} <span className="hidden xl:inline">Import</span>
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
              onContextMenu={songMenu(s)}
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

      {/* ─── The song, slide by slide (click = preview, double-click = on screen) ─── */}
      <section className="flex min-h-0 flex-col rounded-xl border border-line bg-surface-2 shadow-sm max-xl:min-h-[560px]">
        {!song ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <Music className="mx-auto size-10 text-ink-faint" />
              <p className="mt-3 text-[16px] font-semibold text-ink">No songs yet</p>
              <p className="mt-1 text-[14px] text-ink-muted">Press “New song” and paste in the words, or Import.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[20px] font-bold text-ink">{song.title}</h2>
                <p className="truncate text-[13px] text-ink-muted">{[song.author, song.key ? `Key of ${song.key}` : null, `${slides.length} slides`].filter(Boolean).join(" · ")}</p>
              </div>
              <button onClick={() => editSong(song.id)} className="flex h-9 items-center gap-1.5 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4">
                <Pencil className="size-4" /> Edit
              </button>
            </div>
            <p className="shrink-0 px-4 pt-2 text-[12px] text-ink-faint">Click a slide to preview it · double-click (or Enter) to show it on screen · ↑ ↓ to move</p>
            <div ref={listRef} tabIndex={0} onKeyDown={onSlidesKey} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 outline-none">
              {slides.map((s, i) => {
                const on = i === slideIndex;
                const live = liveText !== undefined && liveText === s.content.primaryText;
                return (
                  <div
                    key={i}
                    data-slide={i}
                    onClick={() => { setSlideIndex(i); listRef.current?.focus(); }}
                    onDoubleClick={() => showLive(i)}
                    onContextMenu={menu.open(() => { setSlideIndex(i); return [
                      { label: "Show on screen", icon: <MonitorPlay className="size-4" />, onClick: () => showLive(i) },
                      { label: "Edit the song", icon: <Pencil className="size-4" />, onClick: () => editSong(song.id) },
                    ]; })}
                    className={`group flex cursor-pointer select-none gap-3 rounded-lg border px-3 py-2.5 transition-colors ${live ? "border-danger bg-danger/5" : on ? "border-primary bg-primary-soft/60" : "border-transparent hover:bg-surface-4"}`}
                  >
                    <div className="w-24 shrink-0 pt-0.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${live ? "bg-danger text-white" : on ? "bg-primary text-white" : "bg-surface-4 text-ink-muted"}`}>
                        {live ? "On screen" : s.label}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 whitespace-pre-line text-[16px] leading-snug text-ink" style={{ fontFamily: s.font }}>
                      {richText(s.content.primaryText)}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); showLive(i); }} title="Show on screen"
                      className={`self-center rounded-md p-1.5 text-ink-faint hover:bg-primary hover:text-white ${on ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                      <MonitorPlay className="size-4" />
                    </button>
                  </div>
                );
              })}
              {!slides.length && <p className="py-10 text-center text-[14px] text-ink-muted">This song has no words yet. Press Edit to add them.</p>}
            </div>
          </>
        )}
      </section>

      {/* ─── Preview + actions ─── */}
      <div className="flex min-h-0 flex-col gap-3 lg:col-span-2 xl:col-span-1 xl:overflow-y-auto">
        {song && (
          <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">Preview</h3>
              <span className="text-[12px] text-ink-muted">{picked ? `${slideIndex + 1} of ${slides.length} · ${picked.label}` : ""}</span>
            </div>
            {picked ? <SlidePreview slide={picked} /> : <div className="aspect-video rounded-lg bg-surface-4" />}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => showLive(slideIndex)} disabled={!picked}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-40">
                <MonitorPlay className="size-5" /> Show on screen
              </button>
              <button onClick={() => addSongToService(song)} disabled={!slides.length}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white hover:bg-primary-bright disabled:opacity-40">
                <Plus className="size-5" /> Add to service
              </button>
            </div>
            {inService && <p className="mt-2 text-center text-[13px] text-primary-bright">This song is already in the service</p>}
            {toast && (
              <p role="status" className="fade-in mt-2 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] font-medium text-success">
                <Check className="size-4" /> {toast}
              </p>
            )}
            <div className="mt-2">
              {confirmDelete ? (
                <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-ink">
                  <span className="flex-1">Delete “{song.title}”?</span>
                  <button onClick={() => { deleteSong(song.id); setSelectedId(null); }} className="rounded-md bg-danger px-2.5 py-1 font-semibold text-white">Delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 font-semibold text-ink-muted hover:bg-surface-4">Keep</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-4" /> Delete song
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {editing && editingSong && (
        <SongEditorDialog
          key={editing.id}
          song={editingSong}
          isNew={editing.isNew && !editing.saved}
          onSave={(changes) => { updateSong(editing.id, changes); setEditing((e) => (e ? { ...e, saved: true } : e)); }}
          onCancel={() => {
            // A new song that was never saved is thrown away.
            if (editing.isNew && !editing.saved) { deleteSong(editing.id); setSelectedId(null); }
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
