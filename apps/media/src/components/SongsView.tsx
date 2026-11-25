import { ask } from "./Dialogs";
import { useNotesStore } from "../stores/notes-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShowStore } from "../stores/show-store";
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
import { Copy as CopyIcon, MonitorPlay, Download, FileText } from "lucide-react";
import { partColor } from "../lib/part-colors";
import { ImportDialog } from "./ImportDialog";

export function SongsView() {
  const { songs, filteredSongs, searchQuery, loadSongs, search, addSong, updateSong, deleteSong } = useSongStore();
  const [importOpen, setImportOpen] = useState(false);

  const { addToService, goLive, serviceItems, projectionOpen, openProjection, currentSlide, isLive, isBlack } = useProjectionStore();
  const [selectedId, setSelectedIdRaw] = useState<string | null>(() => { try { return localStorage.getItem("whq-last-song"); } catch { return null; } });
  const setSelectedId = (id: string | null) => { setSelectedIdRaw(id); try { if (id) localStorage.setItem("whq-last-song", id); } catch { /* ignore */ } };
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
    if ((!selectedId || !songs.some((x) => x.id === selectedId)) && songs.length) setSelectedId(songs[0].id);
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

  // The song waits in Preview; picking a slide moves the Preview; Enter or double-click sends it live.
  useEffect(() => {
    if (song && slides.length) useShowStore.getState().setPreview(song.title, slides, slideIndex, song.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, slideIndex]);

  function showLive(i: number) {
    if (!song || !slides[i]) return;
    setSlideIndex(i);
    useShowStore.getState().setPreview(song.title, slides, i, song.id);
    useShowStore.getState().sendPreviewLive(i);
  }

  // Menu bar: Songs › New / Edit / Import.
  useEffect(() => {
    const on = (e: Event) => {
      const a = (e as CustomEvent).detail;
      if (a === "song:new") newSong();
      else if (a === "song:edit" && song) editSong(song.id);
      else if (a === "song:import-ew" || a === "song:import-files") setImportOpen(true);
    };
    window.addEventListener("whq-menu", on);
    return () => window.removeEventListener("whq-menu", on);
  });

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
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); showLive(slideIndex); }
  }
  useEffect(() => {
    listRef.current?.querySelector(`[data-slide="${slideIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [slideIndex]);

  const songMenu = (s: Song) => menu.open(() => [
    { label: "Show on screen", icon: <MonitorPlay className="size-4" />, onClick: () => { const first = buildSongSlides(s)[0]; if (first) { if ((window as any).__TAURI_INTERNALS__ && !projectionOpen) openProjection(); goLive(first); } } },
    { label: "Add to service", icon: <Plus className="size-4" />, onClick: () => addSongToService(s) },
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: () => editSong(s.id) },
    { label: "Make a copy", icon: <CopyIcon className="size-4" />, onClick: () => { const c = { ...JSON.parse(JSON.stringify(s)), id: crypto.randomUUID(), title: `${s.title} (copy)` }; addSong(c); setSelectedId(c.id); } },
    { label: "Move to Notes", icon: <FileText className="size-4" />, onClick: async () => {
      if (!(await ask(`“${s.title}” becomes a page in Notes and leaves the song list.`, "Move", { title: "Move to Notes" }))) return;
      useNotesStore.getState().addPage(s.title, s.sections.map((x) => x.lyrics.trim()).join("\n\n"));
      deleteSong(s.id);
      if (selectedId === s.id) setSelectedId(null);
      setToast("Moved to Notes");
    } },
    { divider: true },
    { label: "Delete", icon: <Trash2 className="size-4" />, danger: true, onClick: async () => { if (await ask(`Delete “${s.title}”? This can't be undone.`, "Delete", { danger: true })) { deleteSong(s.id); if (selectedId === s.id) setSelectedId(null); } } },
  ]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden">
      {menu.element}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
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
          <button onClick={() => setImportOpen(true)} title="Import from EasyWorship and other software"
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line-bright px-2.5 text-[14px] font-semibold text-ink hover:bg-surface-4">
            <Download className="size-4" /> <span className="hidden xl:inline">Import</span>
          </button>
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
              {toast && <span role="status" className="fade-in flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1 text-[12px] font-medium text-success"><Check className="size-3.5" /> {toast}</span>}
              <button onClick={() => editSong(song.id)} className="flex h-9 items-center gap-1.5 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4">
                <Pencil className="size-4" /> Edit
              </button>
              <button onClick={() => addSongToService(song)} disabled={!slides.length} title={inService ? "Already in the schedule (adds it again)" : "Add to the schedule"}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-bright disabled:opacity-40">
                <Plus className="size-4" /> {inService ? "In schedule" : "Add to schedule"}
              </button>
            </div>
            <p className="shrink-0 px-4 pt-2 text-[12px] text-ink-faint">Click a slide to put it in Preview · double-click (or Enter) to send it live · ↑ ↓ to move · right-click a song to delete it</p>
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
                    <span className="w-1 shrink-0 rounded-full" style={{ background: partColor(s.label) ?? "transparent" }} />
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
