import type { Slide } from "../types";

/**
 * A small 16:9 copy of the projector screen. Text sizes are relative to the box width
 * (the projector is 1920px wide), so it looks the same as the real screen at any size.
 */
export function SlidePreview({
  slide, placeholder, highlight, className = "",
}: {
  slide: Slide | null;
  placeholder?: string;
  highlight?: "live" | "ready" | "next";
  className?: string;
}) {
  const bg = slide?.template.background;
  const bgCss = typeof bg === "string" ? bg : "#000";
  const size = slide?.template.fontSize ?? 56;
  const ring =
    highlight === "live" ? "ring-2 ring-danger"
    : highlight === "ready" ? "ring-2 ring-primary"
    : highlight === "next" ? "outline-2 outline-dashed outline-primary"
    : "ring-1 ring-line-bright";
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-lg ${ring} ${className}`}
      style={{ background: slide ? bgCss : "#0f172a", containerType: "inline-size" }}
    >
      {slide ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-[8%] text-center">
          {slide.type === "logo" ? (
            <span className="font-bold text-white/80" style={{ fontSize: "8cqw" }}>WHQ</span>
          ) : (
            <>
              <p
                style={{
                  fontSize: `${size / 19.2}cqw`,
                  fontFamily: slide.template.fontFamily,
                  color: slide.template.fontColor ?? "#fff",
                  textShadow: slide.template.textShadow,
                  lineHeight: 1.3,
                  fontWeight: 600,
                  whiteSpace: "pre-line",
                }}
              >
                {slide.content.primaryText}
              </p>
              {slide.content.secondaryText && (
                <p style={{ fontSize: `${(size * 0.4) / 19.2}cqw`, color: "rgba(255,255,255,0.75)", marginTop: "0.5em", fontFamily: slide.template.fontFamily }}>
                  {slide.content.secondaryText}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        placeholder && <div className="absolute inset-0 grid place-items-center p-4 text-center text-[13px] text-white/60">{placeholder}</div>
      )}
    </div>
  );
}
