import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check, Film, Image as ImageIcon, ImagePlus, Loader2, MonitorOff, MonitorPlay, Pause, Play, Plus,
  RotateCcw, Search, Trash2, Upload, X, Church,
} from "lucide-react";
import { useMediaStore, type MediaItem } from "../stores/media-store";
import { useProjectionStore } from "../stores/projection-store";
import { buildMediaSlide, controlVideo, defaultMediaOptions, mediaToServiceItem, type MediaOptions } from "../lib/media-slides";
import { formatBytes, isDesktopApp, mediaUrl } from "../lib/media-src";
import { SlidePreview } from "./SlidePreview";
import { useContextMenu } from "./ContextMenu";
import { useThemeStore } from "../stores/theme-store";
import { useAudioStore, formatTime } from "../stores/audio-store";
import { presentationSlides, presentationToServiceItem } from "../lib/media-slides";
import { Music2, Presentation as PresIcon, Square as StopIcon, Repeat, Volume2 } from "lucide-react";
import type { ThemeKind } from "../lib/themes";

type Filter = "all" | "image" | "video" | "audio" | "presentations";

export function MediaView() {
  const { items, importing, error, pickFiles, importPaths, importBrowserFiles, remove, rename, clearError, presentations, importPresentation, removePresentation, renamePresentation } = useMediaStore();
  const [presId, setPresId] = useState<string | null>(null);
  const pres = presentations.find((p) => p.id === presId) ?? null;
  const { currentSlide, isLive, isBlack, projectionOpen, goLive, goClear, openProjection, addToService, logo, setLogo } = useProjectionStore();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, MediaOptions>>({});
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const menu = useContextMenu();
  const setBackground = (item: MediaItem, kinds: ThemeKind[]) => {
    const { updateBackground } = useThemeStore.getState();
    for (const k of kinds) updateBackground(k, { kind: item.kind === "video" ? "video" : "image", value: item.path });
    setToast(`“${item.name}” is now the background for ${kinds.length === 3 ? "everything" : kinds.map((k) => ({ song: "songs", scripture: "Bible verses", announcement: "announcements" })[k]).join(" and ")}`);
  };

  const shown = useMemo(
    () => items.filter((i) => (filter === "all" || i.kind === filter) && i.name.toLowerCase().includes(query.toLowerCase())),
    [items, filter, query],
  );
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const opts = selected ? options[selected.id] ?? defaultMediaOptions(selected) : null;
  const slide = selected && opts && selected.kind !== "audio" ? buildMediaSlide(selected, opts) : null;
  const liveMedia = isLive && !isBlack && currentSlide?.media ? currentSlide.media : null;
  const selectedIsLive = !!selected && liveMedia?.src === selected.path;

  useEffect(() => { setConfirmDelete(false); }, [selectedId]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Desktop app: files dragged from Explorer onto the window.
  useEffect(() => {
    if (!isDesktopApp()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      unlisten = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") setDragOver(true);
        else if (p.type === "leave") setDragOver(false);
        else if (p.type === "drop") {
          setDragOver(false);
          importPaths(p.paths).then((added) => { if (added[0]) setSelectedId(added[0].id); });
        }
      });
    })();
    return () => unlisten?.();
  }, [importPaths]);

  async function addFiles() {
    if (isDesktopApp()) {
      const added = await pickFiles();
      if (added[0]) setSelectedId(added[0].id);
    } else {
      fileInput.current?.click();
    }
  }

  function setOpt(changes: Partial<MediaOptions>) {
    if (!selected || !opts) return;
    setOptions((o) => ({ ...o, [selected.id]: { ...opts, ...changes } }));
  }

  function show() {
    if (!slide) return;
    if (isDesktopApp() && !projectionOpen) openProjection();
    goLive(slide);
  }

  return (
    <div
      className="relative grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden"

      onDragOver={(e) => { if (!isDesktopApp() && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => {
        if (isDesktopApp()) return;
        e.preventDefault();
        setDragOver(false);
        const added = importBrowserFiles([...e.dataTransfer.files]);
        if (added[0]) setSelectedId(added[0].id);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const added = importBrowserFiles([...(e.target.files ?? [])]);
          if (added[0]) setSelectedId(added[0].id);
          e.target.value = "";
        }}
      />

      {/* ─── Library ─── */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-2 shadow-sm max-lg:min-h-[480px]">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[18px] font-bold text-ink">Pictures &amp; videos</h2>
          <div className="flex rounded-lg bg-surface-4 p-1">
            {([["all", "All"], ["image", "Pictures"], ["video", "Videos"], ["audio", "Audio"], ["presentations", "Presentations"]] as [Filter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-md px-3 py-1 text-[13px] font-medium ${filter === f ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              className="h-9 w-full rounded-lg border border-line-bright pl-9 pr-3 text-[14px] text-ink outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={addFiles}
            disabled={importing}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-70"
          >
            {importing ? <Loader2 className="size-4 whq-spin" /> : <ImagePlus className="size-4" />}
            {importing ? "Copying…" : "Add pictures, videos or audio"}
          </button>
          <button
            onClick={async () => { const p = await importPresentation(); if (p) { setFilter("presentations"); setPresId(p.id); } }}
            disabled={importing}
            className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-3 text-[14px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-60"
          >
            <PresIcon className="size-4" /> Import PowerPoint or PDF
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} aria-label="Dismiss"><X className="size-4" /></button>
          </div>
        )}

        {filter === "presentations" ? (
          <div className="flex-1 overflow-y-auto p-4">
            {presentations.length === 0 ? (
              <button onClick={() => importPresentation().then((p) => p && setPresId(p.id))} className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-bright p-10 text-center hover:border-primary hover:bg-primary-soft/30">
                <PresIcon className="size-10 text-ink-faint" />
                <span className="text-[17px] font-semibold text-ink">Import a PowerPoint or PDF</span>
                <span className="max-w-md text-[14px] text-ink-muted">Each slide or page becomes a picture you can show, step through with the arrow keys, and add to the service. PowerPoint files need Microsoft PowerPoint on this computer; PDFs work on any Windows 10 or 11 computer.</span>
              </button>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                {presentations.map((p) => (
                  <button key={p.id} onClick={() => setPresId(p.id)} className={`rounded-lg p-1.5 text-left ${p.id === presId ? "bg-primary-soft ring-2 ring-primary" : "hover:bg-surface-4"}`}>
                    <div className="relative aspect-video overflow-hidden rounded-md bg-ink ring-1 ring-line">
                      <img src={mediaUrl(p.slides[0])} alt="" className="h-full w-full object-contain" />
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                      <PresIcon className="size-3.5 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{p.name}</span>
                      <span className="text-[12px] text-ink-muted">{p.slides.length}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : items.length === 0 ? (
          <button onClick={addFiles} className="m-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-bright text-center hover:border-primary hover:bg-primary-soft/30">
            <Upload className="size-10 text-ink-faint" />
            <span className="text-[17px] font-semibold text-ink">Add your first pictures or videos</span>
            <span className="max-w-md text-[14px] text-ink-muted">
              Click here, or drag files from your computer or USB stick onto this window. They are copied into WorshipHQ, so they keep working after you unplug the USB stick.
            </span>
            <span className="text-[13px] text-ink-faint">Pictures: JPG, PNG, GIF, WEBP · Videos: MP4, WEBM, MOV</span>
          </button>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
              {shown.map((item) => {
                const on = item.id === selectedId;
                const live = liveMedia?.src === item.path;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    onDoubleClick={() => { setSelectedId(item.id); goLive(buildMediaSlide(item, options[item.id] ?? defaultMediaOptions(item))); }}
                    onContextMenu={menu.open(() => {
                      setSelectedId(item.id);
                      const o = options[item.id] ?? defaultMediaOptions(item);
                      const bgWord = item.kind === "video" ? "video background" : "background";
                      return [
                        { label: "Show on screen", icon: <MonitorPlay className="size-4" />, onClick: () => { if (isDesktopApp() && !projectionOpen) openProjection(); goLive(buildMediaSlide(item, o)); } },
                        { label: "Add to service", icon: <Plus className="size-4" />, onClick: () => { addToService(mediaToServiceItem(item, o)); setToast(`${item.name} added to the service`); } },
                        { divider: true },
                        { heading: `Use as ${bgWord}` },
                        { label: "For songs", icon: <ImageIcon className="size-4" />, onClick: () => setBackground(item, ["song"]) },
                        { label: "For Bible verses", icon: <ImageIcon className="size-4" />, onClick: () => setBackground(item, ["scripture"]) },
                        { label: "For announcements", icon: <ImageIcon className="size-4" />, onClick: () => setBackground(item, ["announcement"]) },
                        { label: "For everything", icon: <ImageIcon className="size-4" />, onClick: () => setBackground(item, ["song", "scripture", "announcement"]) },
                        { divider: true },
                        ...(item.kind === "image" ? [{ label: logo?.src === item.path ? "Stop using as church logo" : "Use as church logo", icon: <Church className="size-4" />, onClick: () => setLogo(logo?.src === item.path ? null : { src: item.path, kind: "image" as const }) }] : []),
                        { label: "Delete", icon: <Trash2 className="size-4" />, danger: true, onClick: () => { remove(item.id); setSelectedId(null); } },
                      ];
                    })}
                    className={`rounded-lg p-1.5 text-left transition-colors ${on ? "bg-primary-soft ring-2 ring-primary" : "hover:bg-surface-4"}`}
                  >
                    <Thumb item={item} live={live} />
                    <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                      {item.kind === "video" ? <Film className="size-3.5 shrink-0 text-ink-faint" /> : <ImageIcon className="size-3.5 shrink-0 text-ink-faint" />}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{item.name}</span>
                      {live && <span className="rounded bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">ON SCREEN</span>}
                      {logo?.src === item.path && <Church className="size-3.5 text-primary-bright" aria-label="Church logo" />}
                    </div>
                  </button>
                );
              })}
            </div>
            {shown.length === 0 && <p className="py-12 text-center text-[14px] text-ink-muted">Nothing matches “{query}”.</p>}
          </div>
        )}
      </section>

      {/* ─── Selected item ─── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {filter === "presentations" ? (
          <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
            {!pres ? (
              <div className="py-10 text-center text-[14px] text-ink-muted">Click a presentation to see its slides.</div>
            ) : (
              <>
                <input value={pres.name} onChange={(e) => renamePresentation(pres.id, e.target.value)} aria-label="Name"
                  className="mb-1 w-full rounded-md bg-transparent px-1 text-[16px] font-bold text-ink outline-none hover:bg-surface-4 focus:bg-surface-4" />
                <p className="mb-2 px-1 text-[12px] text-ink-muted">{pres.slides.length} slides · click one to show it</p>
                <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
                  {presentationSlides(pres).map((sl, i) => (
                    <button key={i} onClick={() => { if (isDesktopApp() && !projectionOpen) openProjection(); goLive(sl); }} className="rounded-md p-0.5 text-left hover:bg-surface-4">
                      <SlidePreview slide={sl} highlight={liveMedia?.src === sl.media!.src ? "live" : undefined} />
                      <span className="text-[11px] font-semibold text-ink-muted">{i + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <button onClick={() => { addToService(presentationToServiceItem(pres)); setToast(`${pres.name} added to the service`); }} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white hover:bg-primary-bright">
                    <Plus className="size-5" /> Add to service
                  </button>
                  {toast && <p role="status" className="fade-in flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] font-medium text-success"><Check className="size-4" /> {toast}</p>}
                  <button onClick={() => { removePresentation(pres.id); setPresId(null); }} className="flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" /> Delete
                  </button>
                </div>
              </>
            )}
          </section>
        ) : selected?.kind === "audio" ? (
          <AudioPanel item={selected} onRename={(n) => rename(selected.id, n)} onDelete={() => { remove(selected.id); setSelectedId(null); }} />
        ) : (
        <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
          {!selected || !opts || !slide ? (
            <div className="py-10 text-center text-[14px] text-ink-muted">Click a picture or video to see options.</div>
          ) : (
            <>
              <input
                value={selected.name}
                onChange={(e) => rename(selected.id, e.target.value)}
                aria-label="Name"
                className="mb-1 w-full rounded-md bg-transparent px-1 text-[16px] font-bold text-ink outline-none hover:bg-surface-4 focus:bg-surface-4"
              />
              <p className="mb-2 px-1 text-[12px] text-ink-muted">
                {selected.kind === "video" ? "Video" : "Picture"}{selected.size ? ` · ${formatBytes(selected.size)}` : ""}
                {selected.temporary && " · browser preview only, gone after reload"}
              </p>
              <SlidePreview slide={slide} highlight={selectedIsLive ? "live" : "ready"} />

              <div className="mt-3 space-y-3">
                <Choice
                  label="On the screen"
                  value={opts.fit}
                  options={[["contain", "Show it all"], ["cover", "Fill the screen"]]}
                  onChange={(v) => setOpt({ fit: v as MediaOptions["fit"] })}
                />
                {selected.kind === "video" && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-ink">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={opts.sound} onChange={(e) => setOpt({ sound: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
                      Play the sound
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={opts.loop} onChange={(e) => setOpt({ loop: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
                      Repeat (loop)
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button onClick={show} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[16px] font-bold text-white hover:bg-primary-bright">
                  <MonitorPlay className="size-5" /> Show on screen
                </button>
                <button
                  onClick={() => { addToService(mediaToServiceItem(selected, opts)); setToast(`${selected.name} added to the service`); }}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line-bright text-[15px] font-semibold text-ink hover:bg-surface-4"
                >
                  <Plus className="size-5" /> Add to service
                </button>
                {selected.kind === "image" && (
                  <button
                    onClick={() => { const isLogo = logo?.src === selected.path; setLogo(isLogo ? null : { src: selected.path, kind: "image" }); setToast(isLogo ? "Logo removed" : "Set as the church logo"); }}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink"
                  >
                    <Church className="size-4" /> {logo?.src === selected.path ? "Stop using as the church logo" : "Use as the church logo (Logo button)"}
                  </button>
                )}
                {toast && (
                  <p role="status" className="fade-in flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] font-medium text-success">
                    <Check className="size-4" /> {toast}
                  </p>
                )}
                {confirmDelete ? (
                  <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-ink">
                    <span className="flex-1">Delete “{selected.name}” from WorshipHQ?</span>
                    <button onClick={() => { remove(selected.id); setSelectedId(null); }} className="rounded-md bg-danger px-2.5 py-1 font-semibold text-white">Delete</button>
                    <button onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 font-semibold text-ink-muted hover:bg-surface-4">Keep</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" /> Delete
                  </button>
                )}
              </div>
            </>
          )}
        </section>
        )}

        {liveMedia && (
          <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">On screen now</h3>
              <span className="text-[12px] font-semibold text-danger">● Live</span>
            </div>
            <SlidePreview slide={currentSlide} highlight="live" />
            {liveMedia.kind === "video" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <VideoButton onClick={() => controlVideo("play")}><Play className="size-4" /> Play</VideoButton>
                <VideoButton onClick={() => controlVideo("pause")}><Pause className="size-4" /> Pause</VideoButton>
                <VideoButton onClick={() => controlVideo("restart")}><RotateCcw className="size-4" /> Restart</VideoButton>
              </div>
            )}
            <button onClick={goClear} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink">
              <MonitorOff className="size-4" /> Take it off the screen
            </button>
          </section>
        )}
      </div>

      {menu.element}
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-2xl border-4 border-dashed border-primary bg-primary-soft/80">
          <div className="text-center">
            <Upload className="mx-auto size-12 text-primary-bright" />
            <p className="mt-2 text-[20px] font-bold text-primary-bright">Drop to add to WorshipHQ</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ item, live }: { item: MediaItem; live: boolean }) {
  const ring = live ? "ring-2 ring-danger" : "ring-1 ring-line";
  const playing = useAudioStore((a) => a.trackId === item.id && a.playing);
  return (
    <div className={`relative aspect-video overflow-hidden rounded-md bg-ink ${ring}`}>
      {item.kind === "audio" ? (
        <div className={`grid h-full w-full place-items-center ${playing ? "bg-primary" : "bg-gradient-to-br from-primary-dim to-ink"}`}>
          <Music2 className={`size-10 text-white ${playing ? "live-dot" : ""}`} />
        </div>
      ) : item.kind === "image" ? (
        <img src={mediaUrl(item.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <>
          <video src={mediaUrl(item.path) + "#t=0.5"} muted preload="metadata" playsInline className="h-full w-full object-cover" />
          <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white">
            <Play className="size-3.5" />
          </span>
        </>
      )}
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-ink-muted">{label}</div>
      <div className="grid gap-1 rounded-lg bg-surface-4 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(([v, text]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`rounded-md py-1.5 text-[13px] font-medium ${value === v ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function VideoButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-surface-4 text-[13px] font-semibold text-ink hover:bg-surface-5">
      {children}
    </button>
  );
}

/** Plays an audio track through this computer's sound output (usually the church sound desk). */
function AudioPanel({ item, onRename, onDelete }: { item: MediaItem; onRename: (n: string) => void; onDelete: () => void }) {
  const a = useAudioStore();
  const mine = a.trackId === item.id;
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
      <input value={item.name} onChange={(e) => onRename(e.target.value)} aria-label="Name"
        className="mb-1 w-full rounded-md bg-transparent px-1 text-[16px] font-bold text-ink outline-none hover:bg-surface-4 focus:bg-surface-4" />
      <p className="mb-3 px-1 text-[12px] text-ink-muted">Audio{item.size ? ` · ${formatBytes(item.size)}` : ""} · plays through this computer's speakers or sound desk</p>
      <div className={`grid aspect-video place-items-center rounded-lg ${mine && a.playing ? "bg-primary" : "bg-gradient-to-br from-primary-dim to-ink"}`}>
        <Music2 className="size-14 text-white" />
      </div>
      <input type="range" min={0} max={mine ? a.duration || 0 : 0} step={0.1} value={mine ? a.position : 0} onChange={(e) => mine && a.seek(Number(e.target.value))} className="mt-3 w-full accent-[var(--color-primary)]" aria-label="Position" />
      <div className="flex justify-between text-[12px] font-mono text-ink-muted"><span>{formatTime(mine ? a.position : 0)}</span><span>{formatTime(mine ? a.duration : 0)}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button onClick={() => (mine ? a.toggle() : a.play({ id: item.id, name: item.name, path: item.path }))} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-bold text-white hover:bg-primary-bright">
          {mine && a.playing ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Play</>}
        </button>
        <button onClick={a.stop} disabled={!mine} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-4 text-[14px] font-semibold text-ink hover:bg-surface-5 disabled:text-ink-faint"><StopIcon className="size-4" /> Stop</button>
        <button onClick={() => a.fadeOut()} disabled={!mine || !a.playing} className="h-11 rounded-xl bg-surface-4 text-[14px] font-semibold text-ink hover:bg-surface-5 disabled:text-ink-faint">Fade out</button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Volume2 className="size-4 text-ink-muted" />
        <input type="range" min={0} max={1} step={0.05} value={a.volume} onChange={(e) => a.setVolume(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" aria-label="Volume" />
        <button onClick={() => a.setLoop(!a.loop)} aria-pressed={a.loop} title="Repeat" className={`grid size-9 place-items-center rounded-lg ${a.loop ? "bg-primary text-white" : "bg-surface-4 text-ink-muted"}`}><Repeat className="size-4" /></button>
      </div>
      <button onClick={onDelete} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /> Delete</button>
    </section>
  );
}
