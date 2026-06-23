import { useProjectionStore } from "../stores/projection-store";
import type { Slide } from "../types";

export function MonitorOutputs({ previewSlide }: { previewSlide: Slide | null }) {
  const { currentSlide, isLive, isBlack } = useProjectionStore();

  return (
    <div className="flex h-full gap-0">
      {/* Preview Output */}
      <div className="flex flex-1 flex-col border-r border-line p-2">
        <div className="mb-1 text-[9px] font-medium text-ink-muted">Preview Output</div>
        <div className="monitor-frame preview flex-1">
          {previewSlide ? (
            <SlideRenderer slide={previewSlide} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-ink-faint/20">No preview</span>
            </div>
          )}
        </div>
      </div>

      {/* Live Output */}
      <div className="flex flex-1 flex-col p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-medium">
          {isLive && <div className="live-dot size-1.5 rounded-full bg-danger" />}
          <span className={isLive ? "text-danger" : "text-ink-muted"}>Live Output</span>
        </div>
        <div className={`monitor-frame flex-1 ${isLive ? "live" : ""}`}>
          {isBlack ? (
            <div className="h-full bg-black" />
          ) : currentSlide ? (
            <SlideRenderer slide={currentSlide} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-ink-faint/20">No output</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlideRenderer({ slide }: { slide: Slide }) {
  const bg = typeof slide.template.background === "string" ? slide.template.background : "#000";
  return (
    <div
      className="flex h-full w-full items-center justify-center p-4"
      style={{ backgroundColor: bg }}
    >
      {slide.type === "logo" ? (
        <span className="text-sm font-bold text-white/30">WHQ</span>
      ) : (
        <div className="text-center">
          <p
            className="line-clamp-5 text-sm font-bold leading-relaxed text-white/90"
            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
          >
            {slide.content.primaryText}
          </p>
          {slide.content.secondaryText && (
            <p className="mt-1.5 text-[10px] text-white/40">{slide.content.secondaryText}</p>
          )}
        </div>
      )}
    </div>
  );
}
