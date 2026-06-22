import { useEffect, useState } from "react";
import type { Slide } from "../types";

export function ProjectionWindow() {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [isBlack, setIsBlack] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [prevSlide, setPrevSlide] = useState<Slide | null>(null);

  useEffect(() => {
    // Listen for Tauri events from the operator window
    // In production, these come via Tauri IPC events
    // For dev, we use a simple message channel
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "slide-update") {
        setPrevSlide(slide);
        setTransitioning(true);
        setSlide(event.data.slide);
        setIsBlack(false);
        setTimeout(() => {
          setTransitioning(false);
          setPrevSlide(null);
        }, 500);
      } else if (event.data?.type === "go-black") {
        setIsBlack(true);
      } else if (event.data?.type === "go-clear") {
        setSlide(null);
        setIsBlack(false);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [slide]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Previous slide (fading out) */}
      {transitioning && prevSlide && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: 0 }}
        >
          <ProjectionSlide slide={prevSlide} />
        </div>
      )}

      {/* Current slide */}
      {!isBlack && slide && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: transitioning ? 0 : 1 }}
        >
          <ProjectionSlide slide={slide} />
        </div>
      )}

      {/* Black overlay */}
      {isBlack && (
        <div className="absolute inset-0 bg-black transition-opacity duration-300" />
      )}

      {/* Trial watermark */}
      <TrialWatermark />
    </div>
  );
}

function ProjectionSlide({ slide }: { slide: Slide }) {
  const bg = slide.template.background;
  const bgStyle: React.CSSProperties =
    typeof bg === "string"
      ? { backgroundColor: bg }
      : bg.type === "image"
        ? {
            backgroundImage: `url(${bg.src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : {};

  const layout = slide.template.textLayout;
  const isBottom = layout === "bottom";
  const isLowerThird = layout === "lower-third";

  const fontSize = slide.template.fontSize ?? 64;
  const fontFamily = slide.template.fontFamily ?? "system-ui, -apple-system, sans-serif";
  const fontColor = slide.template.fontColor ?? "#ffffff";
  const textShadow = slide.template.textShadow ?? "0 4px 20px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)";

  return (
    <div className="flex h-full w-full flex-col" style={bgStyle}>
      {/* Video background */}
      {typeof bg === "object" && bg.type === "video" && (
        <video
          autoPlay
          loop={bg.loop}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={bg.src} />
        </video>
      )}

      {/* Content area */}
      <div
        className={`relative z-10 flex h-full flex-col ${
          isBottom
            ? "justify-end pb-[10%]"
            : isLowerThird
              ? "justify-end pb-[6%]"
              : "items-center justify-center"
        } px-[8%]`}
      >
        {slide.type === "logo" ? (
          <div className="flex flex-col items-center">
            <div className="grid size-48 place-items-center rounded-3xl bg-white/10 backdrop-blur-sm">
              <span className="text-6xl font-bold text-white">WHQ</span>
            </div>
          </div>
        ) : (
          <div className={isLowerThird ? "max-w-[60%]" : "text-center"}>
            {/* Primary text (lyrics/scripture) */}
            <p
              style={{
                fontSize: `clamp(24px, ${fontSize}px, 120px)`,
                fontFamily,
                color: fontColor,
                textShadow,
                lineHeight: 1.3,
                fontWeight: 600,
                whiteSpace: "pre-line",
              }}
            >
              {slide.content.primaryText}
            </p>

            {/* Secondary text (reference/translation) */}
            {slide.content.secondaryText && (
              <p
                style={{
                  fontSize: `clamp(14px, ${fontSize * 0.4}px, 48px)`,
                  fontFamily,
                  color: "rgba(255,255,255,0.75)",
                  textShadow: "0 2px 10px rgba(0,0,0,0.5)",
                  marginTop: "0.5em",
                  fontWeight: 400,
                }}
              >
                {slide.content.secondaryText}
              </p>
            )}

            {/* Metadata (copyright/CCLI) */}
            {slide.content.metadata && (
              <p
                style={{
                  fontSize: `clamp(10px, ${fontSize * 0.2}px, 24px)`,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: "0.3em",
                }}
              >
                {slide.content.metadata}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TrialWatermark() {
  // TODO: Check actual license status from Tauri backend
  const isTrial = true;

  if (!isTrial) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div
        className="select-none text-white/[0.08]"
        style={{
          fontSize: "5vw",
          fontWeight: 800,
          transform: "rotate(-30deg)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        WorshipHQ Media — Trial
      </div>
    </div>
  );
}
