import { Monitor, MonitorOff } from "lucide-react";
import type { Slide } from "../types";

export function PreviewPanel({
  currentSlide,
  nextSlide,
  isLive,
  isBlack,
}: {
  currentSlide: Slide | null;
  nextSlide: Slide | null;
  isLive: boolean;
  isBlack: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {/* Live output preview */}
      <div className="flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <div
            className={`size-2 rounded-full ${isLive ? "animate-pulse bg-danger" : "bg-ink-faint"}`}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {isLive ? "Live Output" : "Preview"}
          </span>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
          {isBlack ? (
            <div className="grid h-full place-items-center">
              <MonitorOff className="size-8 text-ink-faint/30" />
            </div>
          ) : currentSlide ? (
            <SlideRenderer slide={currentSlide} />
          ) : (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <Monitor className="mx-auto size-8 text-ink-faint/30" />
                <p className="mt-2 text-xs text-ink-faint">No slide active</p>
                <p className="mt-0.5 text-[10px] text-ink-faint/60">
                  Select a scripture, song, or media to preview
                </p>
              </div>
            </div>
          )}

          {/* Live indicator */}
          {isLive && !isBlack && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-danger/90 px-2 py-0.5">
              <div className="size-1.5 animate-pulse rounded-full bg-white" />
              <span className="text-[9px] font-bold text-white">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Next slide preview */}
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Up Next
        </span>
        <div className="aspect-video w-48 overflow-hidden rounded-lg border border-line-soft bg-black/50">
          {nextSlide ? (
            <SlideRenderer slide={nextSlide} small />
          ) : (
            <div className="grid h-full place-items-center">
              <span className="text-[10px] text-ink-faint/40">Empty</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlideRenderer({ slide, small }: { slide: Slide; small?: boolean }) {
  const bgStyle: React.CSSProperties =
    typeof slide.template.background === "string"
      ? { backgroundColor: slide.template.background }
      : slide.template.background.type === "image"
        ? { backgroundImage: `url(${slide.template.background.src})`, backgroundSize: "cover", backgroundPosition: "center" }
        : {};

  const layout = slide.template.textLayout;
  const alignClass =
    layout === "bottom"
      ? "items-end justify-center pb-[12%]"
      : layout === "lower-third"
        ? "items-end justify-start pb-[8%] pl-[5%]"
        : layout === "split"
          ? "items-center justify-center"
          : "items-center justify-center";

  return (
    <div
      className={`flex h-full flex-col ${alignClass} px-[8%]`}
      style={bgStyle}
    >
      {slide.type === "logo" ? (
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/10">
            <span className={`font-bold text-white ${small ? "text-xs" : "text-xl"}`}>
              WHQ
            </span>
          </div>
        </div>
      ) : (
        <div className={`text-center ${layout === "lower-third" ? "text-left" : ""}`}>
          <p
            className={`font-semibold leading-snug text-white ${
              small ? "text-[8px]" : "text-lg"
            }`}
            style={{
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              fontFamily: slide.template.fontFamily,
            }}
          >
            {slide.content.primaryText}
          </p>
          {slide.content.secondaryText && (
            <p
              className={`mt-1 text-white/70 ${
                small ? "text-[6px]" : "text-xs"
              }`}
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
            >
              {slide.content.secondaryText}
            </p>
          )}
          {slide.content.metadata && (
            <p
              className={`mt-0.5 text-white/40 ${
                small ? "text-[5px]" : "text-[10px]"
              }`}
            >
              {slide.content.metadata}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
