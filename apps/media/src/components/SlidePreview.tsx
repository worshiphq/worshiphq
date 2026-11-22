import type { Slide } from "../types";
import { ScaledSlide } from "./SlideCanvas";

/** A small copy of the projector screen, drawn by the same renderer as the projector. */
export function SlidePreview({
  slide, placeholder, highlight, className = "",
}: {
  slide: Slide | null;
  placeholder?: string;
  highlight?: "live" | "ready" | "next";
  className?: string;
}) {
  const ring =
    highlight === "live" ? "ring-2 ring-danger"
    : highlight === "ready" ? "ring-2 ring-primary"
    : highlight === "next" ? "outline-2 outline-dashed outline-primary"
    : "ring-1 ring-line-bright";
  if (!slide) {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-lg bg-[#0f172a] ${ring} ${className}`}>
        {placeholder && <div className="absolute inset-0 grid place-items-center p-4 text-center text-[13px] text-white/60">{placeholder}</div>}
      </div>
    );
  }
  return <ScaledSlide slide={slide} className={`rounded-lg ${ring} ${className}`} />;
}
