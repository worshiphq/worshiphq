import { useState } from "react";
import { Play, MonitorOff, ImageIcon, X, ChevronLeft, ChevronRight, Plus, Clock, GripVertical, Trash2 } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import type { Slide, ServiceItem } from "../types";

export function Dashboard() {
  const {
    currentSlide, isLive, isBlack, serviceItems, activeItemIndex,
    goLive, goBlack, goLogo, goClear, setActiveItem, removeFromService,
  } = useProjectionStore();

  const activeItem = activeItemIndex >= 0 ? serviceItems[activeItemIndex] : null;
  const activeSlideIndex = useState(0);
  const [currentSlideIdx, setCurrentSlideIdx] = activeSlideIndex;

  function goToSlide(item: ServiceItem, slideIdx: number) {
    if (!item.slides || !item.slides[slideIdx]) return;
    setCurrentSlideIdx(slideIdx);
    goLive(item.slides[slideIdx]);
  }

  function nextSlide() {
    if (!activeItem?.slides) return;
    const next = currentSlideIdx + 1;
    if (next < activeItem.slides.length) {
      goToSlide(activeItem, next);
    }
  }

  function prevSlide() {
    if (!activeItem?.slides) return;
    const prev = currentSlideIdx - 1;
    if (prev >= 0) {
      goToSlide(activeItem, prev);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: Go Live controls */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => currentSlide && goLive(currentSlide)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[11px] font-bold transition-all ${
              isLive
                ? "bg-danger text-white shadow-lg shadow-danger/20"
                : "bg-success text-white hover:bg-success/90"
            }`}
          >
            <Play className="size-3" />
            {isLive ? "LIVE" : "Go Live"}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {[
            { label: "Clear", icon: X, action: goClear },
            { label: "Black", icon: MonitorOff, action: goBlack },
            { label: "Logo", icon: ImageIcon, action: goLogo },
          ].map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              onClick={action}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                (label === "Black" && isBlack)
                  ? "bg-ink text-surface"
                  : "bg-surface-4 text-ink-faint hover:bg-surface-5 hover:text-ink-muted"
              }`}
            >
              <Icon className="size-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Flow section */}
      <div className="shrink-0 border-b border-line bg-surface/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Live Flow</h2>
          <span className="text-[10px] text-ink-faint">WORSHIPHQ MEDIA 4</span>
        </div>

        <div className="flex gap-3">
          {/* Current */}
          <div className="flex-1">
            <div className="mb-1 text-[10px] font-medium text-ink-faint">Current</div>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
              {isBlack ? (
                <div className="grid h-full place-items-center"><MonitorOff className="size-6 text-ink-faint/20" /></div>
              ) : currentSlide ? (
                <MiniSlide slide={currentSlide} />
              ) : (
                <div className="grid h-full place-items-center"><span className="text-[10px] text-ink-faint/30">No output</span></div>
              )}
              {isLive && !isBlack && (
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-danger/90 px-1.5 py-0.5">
                  <div className="live-dot size-1 rounded-full bg-white" />
                  <span className="text-[8px] font-bold text-white">LIVE</span>
                </div>
              )}
            </div>
            {activeItem && <div className="mt-1 truncate text-[10px] font-medium text-ink">{activeItem.title}</div>}
          </div>

          {/* Timing */}
          <div className="flex-1">
            <div className="mb-1 text-[10px] font-medium text-ink-faint">Timing</div>
            <div className="flex items-center gap-2">
              <button onClick={prevSlide} className="grid size-6 place-items-center rounded border border-line text-ink-faint hover:bg-surface-4">
                <ChevronLeft className="size-3" />
              </button>
              <div className="flex flex-1 gap-1 overflow-hidden">
                {(activeItem?.slides ?? []).slice(0, 4).map((slide, i) => (
                  <button
                    key={i}
                    onClick={() => activeItem && goToSlide(activeItem, i)}
                    className={`slide-thumb flex-1 overflow-hidden rounded border transition-all ${
                      i === currentSlideIdx ? "active border-primary/50" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <div className="aspect-video bg-black p-1">
                      <p className="line-clamp-2 text-[6px] leading-tight text-white/70">{slide.content.primaryText.slice(0, 60)}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={nextSlide} className="grid size-6 place-items-center rounded border border-line text-ink-faint hover:bg-surface-4">
                <ChevronRight className="size-3" />
              </button>
            </div>
            {activeItem && (
              <div className="mt-1.5">
                <div className="text-[10px] font-medium text-ink-muted">Current</div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
                  <div
                    className="progress-shimmer h-full rounded-full"
                    style={{ width: activeItem.slides ? `${((currentSlideIdx + 1) / activeItem.slides.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Upcoming */}
          <div className="flex-1">
            <div className="mb-1 text-[10px] font-medium text-ink-faint">Upcoming</div>
            <div className="space-y-1">
              {serviceItems.slice(activeItemIndex + 1, activeItemIndex + 4).map((item, i) => (
                <div key={item.id} className="flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1">
                  <span className="text-[9px] text-ink-faint">{activeItemIndex + 2 + i}.</span>
                  <span className="truncate text-[10px] text-ink-muted">{item.title}</span>
                </div>
              ))}
              {serviceItems.length <= activeItemIndex + 1 && (
                <div className="rounded-md bg-surface-3 px-2 py-3 text-center text-[10px] text-ink-faint/40">No upcoming items</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="shrink-0 border-b border-line px-4 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Schedule</h3>
          <span className="rounded bg-surface-4 px-1.5 py-0.5 text-[9px] text-ink-faint">{serviceItems.length} items</span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {serviceItems.map((item, i) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveItem(i);
                setCurrentSlideIdx(0);
                if (item.slides?.[0]) goLive(item.slides[0]);
              }}
              className={`group relative flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-all ${
                i === activeItemIndex
                  ? "border-primary/40 bg-primary/10"
                  : "border-line bg-surface-3 hover:border-ink-faint"
              }`}
            >
              <span className="text-[9px] text-ink-faint">{i + 1}.</span>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-medium text-ink" style={{ maxWidth: 120 }}>{item.title}</div>
                {item.subtitle && <div className="truncate text-[9px] text-ink-faint" style={{ maxWidth: 120 }}>{item.subtitle}</div>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFromService(i); }}
                className="ml-1 grid size-4 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="size-2.5" />
              </button>
            </button>
          ))}
          {serviceItems.length === 0 && (
            <div className="flex w-full items-center justify-center py-3 text-[10px] text-ink-faint/40">
              Add items from the library to build your service
            </div>
          )}
        </div>
      </div>

      {/* Slide Thumbnails */}
      <div className="flex-1 overflow-hidden px-4 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {activeItem ? `Current Song (${activeItem.slides?.length ?? 0} slides)` : "Slide Thumbnails"}
          </h3>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(activeItem?.slides ?? []).map((slide, i) => (
            <button
              key={i}
              onClick={() => activeItem && goToSlide(activeItem, i)}
              className={`slide-thumb shrink-0 overflow-hidden rounded-lg border transition-all ${
                i === currentSlideIdx ? "active border-primary/50 ring-1 ring-primary/30" : "border-line hover:border-ink-faint"
              }`}
            >
              <div className="flex aspect-video w-36 flex-col justify-center bg-black p-3">
                <p className="line-clamp-3 text-center text-[8px] font-medium leading-relaxed text-white/80">
                  {slide.content.primaryText.split("\n").slice(0, 3).join("\n")}
                </p>
              </div>
              <div className="bg-surface-3 px-2 py-1">
                <span className="text-[9px] text-ink-faint">{i + 1}</span>
              </div>
            </button>
          ))}

          {activeItem && (
            <button className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-surface-3 px-6 text-ink-faint transition-colors hover:border-primary/30 hover:text-primary-bright">
              <Plus className="size-4" />
            </button>
          )}

          {!activeItem && (
            <div className="flex w-full items-center justify-center py-6 text-[10px] text-ink-faint/40">
              Select a service item to see its slides
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniSlide({ slide }: { slide: Slide }) {
  const bg = typeof slide.template.background === "string" ? slide.template.background : "#000";
  return (
    <div className="flex h-full w-full items-center justify-center p-2" style={{ backgroundColor: bg }}>
      {slide.type === "logo" ? (
        <span className="text-[10px] font-bold text-white/60">WHQ</span>
      ) : (
        <p className="line-clamp-3 text-center text-[8px] font-medium leading-relaxed text-white/80">
          {slide.content.primaryText}
        </p>
      )}
    </div>
  );
}
