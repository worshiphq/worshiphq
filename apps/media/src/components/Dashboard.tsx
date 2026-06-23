import { useState } from "react";
import {
  Play, Square, MonitorOff, ImageIcon, X,
  ChevronLeft, ChevronRight, Plus, Trash2,
  Monitor, Eye, Tv,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import type { Slide, ServiceItem } from "../types";

export function Dashboard() {
  const {
    currentSlide, isLive, isBlack, serviceItems, activeItemIndex,
    goLive, goBlack, goLogo, goClear, setActiveItem, removeFromService,
  } = useProjectionStore();

  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [previewSlide, setPreviewSlide] = useState<Slide | null>(null);

  const activeItem = activeItemIndex >= 0 ? serviceItems[activeItemIndex] : null;

  function goToSlide(item: ServiceItem, slideIdx: number) {
    if (!item.slides?.[slideIdx]) return;
    setCurrentSlideIdx(slideIdx);
    setPreviewSlide(item.slides[slideIdx]);
  }

  function sendToLive() {
    if (previewSlide) goLive(previewSlide);
  }

  function nextSlide() {
    if (!activeItem?.slides) return;
    const next = currentSlideIdx + 1;
    if (next < activeItem.slides.length) goToSlide(activeItem, next);
  }

  function prevSlide() {
    if (!activeItem?.slides) return;
    const prev = currentSlideIdx - 1;
    if (prev >= 0) goToSlide(activeItem, prev);
  }

  return (
    <div className="flex h-full flex-col">
      {/* ─── Control Bar ─── */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface-2/80 px-4 py-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={sendToLive}
            className={`btn-primary flex items-center gap-2 px-5 py-1.5 text-[12px] ${
              isLive ? "btn-danger" : ""
            }`}
          >
            <Play className="size-3.5" />
            {isLive ? "LIVE" : "Go Live"}
          </button>

          {isLive && (
            <button
              onClick={goClear}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
            >
              <Square className="size-3" />
              Stop
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { label: "Clear", icon: X, action: goClear, isActive: false },
            { label: "Black", icon: MonitorOff, action: goBlack, isActive: isBlack },
            { label: "Logo", icon: ImageIcon, action: goLogo, isActive: false },
          ].map(({ label, icon: Icon, action, isActive }) => (
            <button
              key={label}
              onClick={action}
              className={`btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[11px] ${
                isActive ? "!bg-ink !text-surface !border-ink" : ""
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Dual Preview Monitors ─── */}
      <div className="shrink-0 border-b border-line bg-surface/60 p-4">
        <div className="flex gap-4">
          {/* PREVIEW Monitor */}
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Eye className="size-3.5 text-primary-bright" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Preview</span>
              <div className="badge badge-preview ml-auto">
                <span>PREVIEW</span>
              </div>
            </div>
            <div className="monitor-frame preview aspect-video w-full">
              {previewSlide ? (
                <SlidePreview slide={previewSlide} />
              ) : currentSlide ? (
                <SlidePreview slide={currentSlide} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Monitor className="mx-auto size-8 text-ink-faint/10" />
                    <p className="mt-2 text-[11px] text-ink-faint/30">Select a slide to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* LIVE OUTPUT Monitor */}
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Tv className="size-3.5 text-danger" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Live Output</span>
              {isLive && (
                <div className="badge badge-live ml-auto">
                  <div className="live-dot size-1.5 rounded-full bg-danger" />
                  <span>LIVE</span>
                </div>
              )}
              {!isLive && (
                <span className="ml-auto text-[10px] text-ink-faint">OFF</span>
              )}
            </div>
            <div className={`monitor-frame aspect-video w-full ${isLive ? "live" : ""}`}>
              {isBlack ? (
                <div className="flex h-full items-center justify-center bg-black">
                  <MonitorOff className="size-8 text-ink-faint/10" />
                </div>
              ) : currentSlide ? (
                <SlidePreview slide={currentSlide} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Tv className="mx-auto size-8 text-ink-faint/10" />
                    <p className="mt-2 text-[11px] text-ink-faint/30">No live output</p>
                  </div>
                </div>
              )}
              {isLive && !isBlack && (
                <div className="absolute right-2 top-2 badge badge-live shadow-lg shadow-danger/20">
                  <div className="live-dot size-1.5 rounded-full bg-danger" />
                  <span className="text-[9px] font-bold">LIVE</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation under preview */}
        {activeItem?.slides && activeItem.slides.length > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <button onClick={prevSlide} className="btn-ghost grid size-7 place-items-center">
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
                <div
                  className="progress-shimmer h-full rounded-full transition-all duration-300"
                  style={{ width: `${((currentSlideIdx + 1) / activeItem.slides.length) * 100}%` }}
                />
              </div>
              <div className="mt-1 text-center text-[10px] text-ink-faint">
                Slide {currentSlideIdx + 1} of {activeItem.slides.length}
                {activeItem && <span className="mx-1.5 text-ink-faint/30">|</span>}
                <span className="text-ink-muted">{activeItem.title}</span>
              </div>
            </div>
            <button onClick={nextSlide} className="btn-ghost grid size-7 place-items-center">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* ─── Schedule / Order of Service ─── */}
      <div className="shrink-0 border-b border-line px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Order of Service</h3>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-surface-4 px-2.5 py-0.5 text-[10px] font-medium text-ink-faint">
              {serviceItems.length} items
            </span>
            <button className="btn-ghost grid size-6 place-items-center !rounded-lg">
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {serviceItems.map((item, i) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveItem(i);
                setCurrentSlideIdx(0);
                if (item.slides?.[0]) {
                  setPreviewSlide(item.slides[0]);
                }
              }}
              className={`group relative flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                i === activeItemIndex
                  ? "border-primary/40 bg-primary/10 shadow-md shadow-primary/5"
                  : "border-line bg-surface-3 hover:border-line-bright hover:bg-surface-4"
              }`}
            >
              <span className={`text-[10px] font-bold ${i === activeItemIndex ? "text-primary-bright" : "text-ink-faint"}`}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-ink" style={{ maxWidth: 130 }}>{item.title}</div>
                {item.subtitle && (
                  <div className="truncate text-[9px] text-ink-faint" style={{ maxWidth: 130 }}>{item.subtitle}</div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFromService(i); }}
                className="ml-1 grid size-5 place-items-center rounded-lg text-ink-faint opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            </button>
          ))}
          {serviceItems.length === 0 && (
            <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-line py-4 text-[11px] text-ink-faint/40">
              Add items from the library to build your service
            </div>
          )}
        </div>
      </div>

      {/* ─── Slide Thumbnails ─── */}
      <div className="flex-1 overflow-hidden px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {activeItem ? activeItem.title : "Slides"}
          </h3>
          {activeItem?.slides && (
            <span className="text-[10px] text-ink-faint">{activeItem.slides.length} slides</span>
          )}
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-2">
          {(activeItem?.slides ?? []).map((slide, i) => (
            <button
              key={i}
              onClick={() => activeItem && goToSlide(activeItem, i)}
              className={`slide-thumb shrink-0 overflow-hidden border transition-all ${
                i === currentSlideIdx
                  ? "active border-primary ring-1 ring-primary/20"
                  : "border-line hover:border-line-bright"
              }`}
            >
              <div className="flex aspect-video w-40 flex-col justify-center bg-black p-4">
                <p className="line-clamp-3 text-center text-[9px] font-medium leading-relaxed text-white/80">
                  {slide.content.primaryText.split("\n").slice(0, 3).join("\n")}
                </p>
                {slide.content.secondaryText && (
                  <p className="mt-1 text-center text-[7px] text-white/40">{slide.content.secondaryText}</p>
                )}
              </div>
              <div className="flex items-center justify-between bg-surface-3 px-2.5 py-1">
                <span className="text-[9px] font-medium text-ink-faint">Slide {i + 1}</span>
                {i === currentSlideIdx && (
                  <div className="size-1.5 rounded-full bg-primary-bright" />
                )}
              </div>
            </button>
          ))}

          {activeItem && (
            <button className="flex shrink-0 items-center justify-center rounded-xl border border-dashed border-line bg-surface-3/50 px-8 text-ink-faint transition-colors hover:border-primary/30 hover:text-primary-bright">
              <Plus className="size-5" />
            </button>
          )}

          {!activeItem && (
            <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-line py-8 text-[11px] text-ink-faint/30">
              Select a service item to see its slides
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlidePreview({ slide }: { slide: Slide }) {
  const bg = typeof slide.template.background === "string" ? slide.template.background : "#000";
  return (
    <div
      className="flex h-full w-full items-center justify-center p-6"
      style={{ backgroundColor: bg }}
    >
      {slide.type === "logo" ? (
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/5">
            <span className="text-2xl font-black text-white/30">WHQ</span>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="line-clamp-4 text-sm font-semibold leading-relaxed text-white/90 drop-shadow-lg"
             style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
            {slide.content.primaryText}
          </p>
          {slide.content.secondaryText && (
            <p className="mt-2 text-xs text-white/50">{slide.content.secondaryText}</p>
          )}
        </div>
      )}
    </div>
  );
}
