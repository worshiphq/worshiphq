import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, BookOpen, Check, ChevronLeft, ChevronRight, Image as ImageIcon,
  ListMusic, MonitorOff, Music, Plus, Search, Trash2, X,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { useSongStore } from "../stores/song-store";
import { songToServiceItem } from "../lib/song-slides";
import type { ServiceItem } from "../types";
import { SlidePreview } from "./SlidePreview";

interface Pos { item: number; slide: number }

const TYPE_ICON: Record<ServiceItem["type"], typeof Music> = {
  song: Music,
  scripture: BookOpen,
  media: ImageIcon,
  announcement: ListMusic,
  custom: ListMusic,
};

export function LiveView({ onOpenBible }: { onOpenBible: () => void }) {
  const {
    serviceItems, activeItemIndex, setActiveItem, currentSlide, isLive, isBlack,
    goLive, goClear, removeFromService, reorderService,
  } = useProjectionStore();
  const activeItem: ServiceItem | null = serviceItems[activeItemIndex] ?? null;

  /** Where the slide that's on screen sits in the service (if it came from the service). */
  const livePos: Pos | null = useMemo(() => {
    if (!isLive || !currentSlide) return null;
    for (let i = 0; i < serviceItems.length; i++) {
      const j = serviceItems[i].slides?.indexOf(currentSlide) ?? -1;
      if (j >= 0) return { item: i, slide: j };
    }
    return null;
  }, [isLive, currentSlide, serviceItems]);

  const step = (from: Pos | null, dir: 1 | -1): Pos | null => {
    if (!from) {
      // Nothing from the service is on screen: start with the selected item's first slide.
      const item = activeItemIndex >= 0 ? activeItemIndex : 0;
      return serviceItems[item]?.slides?.length ? { item, slide: 0 } : null;
    }
    const slides = serviceItems[from.item]?.slides ?? [];
    const slide = from.slide + dir;
    if (slide >= 0 && slide < slides.length) return { item: from.item, slide };
    // Run on into the next (or previous) item that has slides.
    for (let i = from.item + dir; i >= 0 && i < serviceItems.length; i += dir) {
      const n = serviceItems[i].slides?.length ?? 0;
      if (n) return { item: i, slide: dir === 1 ? 0 : n - 1 };
    }
    return null;
  };

  const nextPos = step(livePos, 1);
  const prevPos = livePos ? step(livePos, -1) : null;
  const slideAt = (p: Pos | null) => (p ? serviceItems[p.item]?.slides?.[p.slide] ?? null : null);

  function show(p: Pos | null) {
    const s = slideAt(p);
    if (!p || !s) return;
    if (p.item !== activeItemIndex) setActiveItem(p.item);
    goLive(s);
  }

  // ← → (and Space / Page Up / Page Down for clickers) move through the slides.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && el?.tagName !== "BUTTON")) {
        e.preventDefault();
        show(nextPos);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        show(prevPos);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nextSlide = slideAt(nextPos);
  const nextLabel = nextPos
    ? `${slideAt(nextPos)?.label ?? `Slide ${nextPos.slide + 1}`}${nextPos.item !== livePos?.item ? ` · ${serviceItems[nextPos.item].title}` : ""}`
    : null;

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-hidden p-3" style={{ gridTemplateColumns: "290px minmax(0,1fr) 340px" }}>
      {/* ─── Left: order of service ─── */}
      <Card title="Service order" aside={`${serviceItems.length} item${serviceItems.length === 1 ? "" : "s"}`} className="min-h-0">
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {serviceItems.length === 0 ? (
            <p className="px-2 py-8 text-center text-[14px] leading-relaxed text-ink-muted">
              Nothing here yet. Add songs from the list in the middle, or verses from the <button onClick={onOpenBible} className="font-semibold text-primary-bright hover:underline">Bible</button>.
            </p>
          ) : (
            serviceItems.map((item, i) => {
              const Icon = TYPE_ICON[item.type] ?? ListMusic;
              const selected = i === activeItemIndex;
              const onAir = livePos?.item === i && !isBlack;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveItem(i)}
                  className={`group relative mb-1 flex cursor-pointer items-center gap-2.5 rounded-lg border-l-[3px] py-2 pl-2 pr-1.5 transition-colors ${
                    selected ? "border-primary bg-primary-soft/70" : "border-transparent hover:bg-surface-4"
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-ink-faint">{i + 1}</span>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-md ${selected ? "bg-primary text-white" : "bg-surface-4 text-ink-muted"}`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{item.title}</div>
                    <div className="truncate text-[12px] text-ink-muted">
                      {[item.subtitle, `${item.slides?.length ?? 0} slides`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {onAir && <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">ON SCREEN</span>}
                  <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 shadow-sm group-hover:flex">
                    <MiniButton label="Move up" disabled={i === 0} onClick={() => reorderService(i, i - 1)}><ArrowUp className="size-3.5" /></MiniButton>
                    <MiniButton label="Move down" disabled={i === serviceItems.length - 1} onClick={() => reorderService(i, i + 1)}><ArrowDown className="size-3.5" /></MiniButton>
                    <MiniButton label="Remove from service" danger onClick={() => removeFromService(i)}><Trash2 className="size-3.5" /></MiniButton>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <button
          onClick={onOpenBible}
          className="mt-2 flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-line-bright text-[14px] font-semibold text-ink-muted hover:border-primary hover:text-primary-bright"
        >
          <BookOpen className="size-4" /> Add a Bible passage
        </button>
      </Card>

      {/* ─── Middle: slides of the selected item + song library ─── */}
      <div className="flex min-h-0 flex-col gap-3">
        <Card
          title={activeItem ? activeItem.title : "Slides"}
          aside={activeItem ? "Click a slide to put it on the screen" : undefined}
          className="min-h-0 flex-1"
        >
          {!activeItem ? (
            <div className="grid flex-1 place-items-center text-center text-[14px] text-ink-muted">
              Choose something in the service order to see its slides here.
            </div>
          ) : !activeItem.slides?.length ? (
            <div className="grid flex-1 place-items-center text-center text-[14px] text-ink-muted">This item has no slides.</div>
          ) : (
            <div className="-mx-1 flex-1 overflow-y-auto px-1 pt-1">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                {activeItem.slides.map((slide, j) => {
                  const onAir = livePos?.item === activeItemIndex && livePos.slide === j && !isBlack;
                  const isNext = !onAir && nextPos?.item === activeItemIndex && nextPos.slide === j;
                  return (
                    <button
                      key={j}
                      onClick={() => show({ item: activeItemIndex, slide: j })}
                      className="group rounded-lg p-1 text-left transition-colors hover:bg-surface-4"
                    >
                      <SlidePreview slide={slide} highlight={onAir ? "live" : isNext ? "next" : undefined} />
                      <div className="mt-1.5 flex items-center gap-2 px-0.5">
                        <span className="text-[12px] font-semibold text-ink-faint">{j + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{slide.label ?? `Slide ${j + 1}`}</span>
                        {onAir && <span className="rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">ON SCREEN</span>}
                        {isNext && <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-bright">NEXT</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <SongLibrary />
      </div>

      {/* ─── Right: what's on screen, and what comes next ─── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <Card
          title="On screen now"
          aside={
            isBlack ? <span className="font-semibold text-ink">Black</span>
            : isLive ? <span className="font-semibold text-danger">● Live</span>
            : "Empty"
          }
        >
          <SlidePreview
            slide={isBlack ? null : isLive ? currentSlide : null}
            placeholder={isBlack ? "The screen is black." : "Nothing is showing. Click a slide to start."}
            highlight={isLive && !isBlack ? "live" : undefined}
          />
          <p className="mt-2 truncate text-[13px] text-ink-muted">
            {isLive && !isBlack && currentSlide
              ? livePos
                ? `${currentSlide.label ?? `Slide ${livePos.slide + 1}`} · ${serviceItems[livePos.item].title}`
                : currentSlide.type === "logo" ? "Church logo" : currentSlide.content.secondaryText ?? currentSlide.label ?? ""
              : " "}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => show(prevPos)}
              disabled={!prevPos}
              className="flex h-12 items-center justify-center gap-1 rounded-xl bg-surface-4 text-[15px] font-semibold text-ink hover:bg-surface-5 disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              <ChevronLeft className="size-5" /> Back
            </button>
            <button
              onClick={() => show(nextPos)}
              disabled={!nextPos}
              className="flex h-12 items-center justify-center gap-1 rounded-xl bg-primary text-[15px] font-bold text-white hover:bg-primary-bright disabled:cursor-not-allowed disabled:bg-surface-5 disabled:text-ink-faint"
            >
              {livePos ? "Next" : "Start"} <ChevronRight className="size-5" />
            </button>
          </div>
          <p className="mt-2 text-center text-[12px] text-ink-faint">
            Tip: the <Kbd>←</Kbd> <Kbd>→</Kbd> keys or a presentation clicker do the same.
          </p>

          {(isLive || isBlack) && (
            <button
              onClick={goClear}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink"
            >
              <MonitorOff className="size-4" /> Take it off the screen
            </button>
          )}
        </Card>

        <Card title="Up next" aside={nextLabel ? undefined : "End of the service"}>
          <SlidePreview slide={nextSlide} placeholder="Nothing after this." highlight={nextSlide ? "next" : undefined} />
          {nextLabel && <p className="mt-2 truncate text-[13px] font-medium text-ink">{nextLabel}</p>}
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────── Song library ─────────────────────────── */

function SongLibrary() {
  const { filteredSongs, searchQuery, loadSongs, search } = useSongStore();
  const { serviceItems, addToService } = useProjectionStore();
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => { loadSongs(); }, [loadSongs]);
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 1800);
    return () => clearTimeout(t);
  }, [justAdded]);

  const inService = new Set(serviceItems.map((i) => i.data?.songId).filter(Boolean));

  return (
    <Card title="Add songs to the service" className="h-[38%] min-h-[200px] shrink-0">
      <div className="relative mb-2 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          placeholder="Search songs by title or words"
          aria-label="Search songs"
          className="h-10 w-full rounded-lg border border-line-bright bg-surface-2 pl-9 pr-9 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-glow"
        />
        {searchQuery && (
          <button onClick={() => search("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-faint hover:bg-surface-4">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {filteredSongs.length === 0 && (
          <p className="py-6 text-center text-[14px] text-ink-muted">No songs match “{searchQuery}”.</p>
        )}
        {filteredSongs.map((song) => {
          const added = justAdded === song.id;
          return (
            <div key={song.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-4">
              <Music className="size-4 shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-ink">{song.title}</div>
                <div className="truncate text-[12px] text-ink-muted">
                  {[song.author, song.key ? `Key of ${song.key}` : null].filter(Boolean).join(" · ")}
                  {inService.has(song.id) && <span className="ml-1.5 text-primary-bright">· In the service</span>}
                </div>
              </div>
              <button
                onClick={() => { addToService(songToServiceItem(song)); setJustAdded(song.id); }}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                  added ? "bg-success/10 text-success" : "bg-primary-soft text-primary-bright hover:bg-primary hover:text-white"
                }`}
              >
                {added ? <><Check className="size-4" /> Added</> : <><Plus className="size-4" /> Add</>}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ─────────────────────────── Small pieces ─────────────────────────── */

function Card({ title, aside, className = "", children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface-2 p-3 shadow-sm ${className}`}>
      <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>
        {aside && <span className="shrink-0 truncate text-[12px] text-ink-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function MiniButton({
  label, disabled, danger, onClick, children,
}: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-7 place-items-center rounded text-ink-muted disabled:opacity-30 ${
        danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-4 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-bright bg-surface-4 px-1 py-px font-sans text-[11px] font-medium text-ink-muted">{children}</kbd>;
}

