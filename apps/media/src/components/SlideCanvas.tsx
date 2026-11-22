import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { richText } from "../lib/rich-text";
import type { Slide } from "../types";
import { textShadowFor, themeKindFor, type SlideStyle } from "../lib/themes";
import { useThemeStore } from "../stores/theme-store";
import { mediaUrl } from "../lib/media-src";

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** The style a slide is shown with: the one sent with it, otherwise the current setting for its kind. */
export function useSlideStyle(slide: Slide | null): SlideStyle | null {
  const themes = useThemeStore((s) => s.themes);
  if (!slide) return null;
  return slide.style ?? themes[themeKindFor(slide.type)];
}

/**
 * Draws a slide exactly as on a 1920×1080 projector. The projector and every preview use this,
 * so what you see in the app is what the congregation sees.
 */
export type CanvasPart = "full" | "background" | "foreground";

export function SlideCanvas({
  slide, style, live = false, videoRef, part = "full",
}: {
  slide: Slide;
  style: SlideStyle;
  /** Projector: play videos. Previews: show a still frame. */
  live?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** The projector draws the background and the words as separate layers, so a still background never flickers. */
  part?: CanvasPart;
}) {
  // A picture or video that fills the screen (it is all background).
  if (slide.media) {
    if (part === "foreground") return <div style={{ width: CANVAS_W, height: CANVAS_H }} />;
    const m = slide.media;
    const fit = m.fit === "contain" ? "contain" : "cover";
    return (
      <div style={{ width: CANVAS_W, height: CANVAS_H, background: "#000", position: "relative", overflow: "hidden" }}>
        {m.kind === "image" ? (
          <img src={mediaUrl(m.src)} alt="" style={{ width: "100%", height: "100%", objectFit: fit }} />
        ) : live ? (
          <video ref={videoRef} src={mediaUrl(m.src)} autoPlay loop={!!m.loop} muted={!!m.muted} playsInline style={{ width: "100%", height: "100%", objectFit: fit }} />
        ) : (
          <video src={mediaUrl(m.src) + "#t=0.5"} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: fit }} />
        )}
      </div>
    );
  }

  if (part === "background") {
    return (
      <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative", overflow: "hidden", background: "#000" }}>
        <Background style={style} live={live} />
      </div>
    );
  }
  return <TextSlide slide={slide} style={style} live={live} transparent={part === "foreground"} />;
}

function Background({ style, live }: { style: SlideStyle; live: boolean }) {
  const bg = style.background;
  const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  if (bg.kind === "image" && bg.value) {
    return (
      <>
        <img src={mediaUrl(bg.value)} alt="" style={fill} />
        <div style={{ ...fill, background: `rgba(0,0,0,${bg.dim})` }} />
      </>
    );
  }
  if (bg.kind === "video" && bg.value) {
    return (
      <>
        {live
          ? <video src={mediaUrl(bg.value)} autoPlay loop muted playsInline style={fill} />
          : <video src={mediaUrl(bg.value) + "#t=1"} muted playsInline preload="metadata" style={fill} />}
        <div style={{ ...fill, background: `rgba(0,0,0,${bg.dim})` }} />
      </>
    );
  }
  return <div style={{ ...fill, background: bg.value || "#000" }} />;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function TextSlide({ slide, style, live, transparent = false }: { slide: Slide; style: SlideStyle; live: boolean; transparent?: boolean }) {
  const now = useNow(!!slide.countdownTo);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLParagraphElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);

  const main = slide.countdownTo
    ? (slide.countdownTo - now > 0 ? formatCountdown(slide.countdownTo - now) : slide.content.primaryText || "0:00")
    : slide.content.primaryText ?? "";
  const sub = style.sub.show ? slide.content.secondaryText ?? "" : "";
  const isLogo = slide.type === "logo";

  // Shrink the words until they fit the screen (never larger than the chosen size).
  useLayoutEffect(() => {
    const box = boxRef.current, text = textRef.current, m = mainRef.current, s = subRef.current;
    if (!box || !text || !m) return;
    let size = style.fontSize;
    const apply = () => {
      m.style.fontSize = `${size}px`;
      if (s) s.style.fontSize = `${Math.max(18, style.sub.size * (size / style.fontSize))}px`;
    };
    apply();
    if (!style.shrinkToFit) return;
    let guard = 0;
    while ((text.scrollHeight > box.clientHeight || text.scrollWidth > box.clientWidth) && size > 24 && guard++ < 80) {
      size -= Math.max(2, Math.round(size * 0.05));
      apply();
    }
  }, [main, sub, style]);

  const marginX = Math.round(CANVAS_W * style.margin);
  const marginY = Math.round(CANVAS_H * style.margin);
  const lowerThird = style.position === "lower-third";
  const justify = style.position === "top" ? "flex-start" : style.position === "middle" ? "center" : "flex-end";
  const outline = style.outlineWidth > 0 ? { WebkitTextStroke: `${style.outlineWidth}px ${style.outlineColor}`, paintOrder: "stroke fill" } : {};

  const mainEl = (
    <p
      ref={mainRef}
      style={{
        margin: 0,
        fontFamily: slide.font ?? style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.italic ? "italic" : "normal",
        color: style.color,
        lineHeight: style.lineHeight,
        letterSpacing: `${style.letterSpacing}em`,
        textTransform: style.uppercase ? "uppercase" : "none",
        textShadow: textShadowFor(style),
        whiteSpace: "pre-line",
        overflowWrap: "break-word",
        ...outline,
      } as CSSProperties}
    >
      {richText(main)}
    </p>
  );
  const subEl = sub ? (
    <p
      ref={subRef}
      style={{
        margin: 0,
        marginTop: style.sub.position === "below" ? "0.6em" : 0,
        marginBottom: style.sub.position === "above" ? "0.6em" : 0,
        fontFamily: style.fontFamily,
        fontWeight: Math.min(style.fontWeight, 700),
        color: style.sub.color,
        textTransform: style.sub.uppercase ? "uppercase" : "none",
        textShadow: textShadowFor(style),
        lineHeight: 1.2,
      }}
    >
      {sub}
    </p>
  ) : null;

  if (slide.hideText) {
    return (
      <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative", overflow: "hidden", background: transparent ? "transparent" : "#000" }}>
        {!transparent && <Background style={style} live={live} />}
      </div>
    );
  }

  if (slide.second) {
    return (
      <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative", overflow: "hidden", background: transparent ? "transparent" : "#000" }}>
        {!transparent && <Background style={style} live={live} />}
        <div style={{ position: "absolute", inset: `${marginY * 0.6}px ${marginX}px`, display: "flex", flexDirection: "column" }}>
          <FitBlock text={main} label={sub} style={style} />
          <div style={{ height: 4, margin: "18px 12%", background: "rgba(255,255,255,0.35)", borderRadius: 2, flexShrink: 0 }} />
          <FitBlock text={slide.second.text} label={style.sub.show ? slide.second.label : ""} style={style} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative", overflow: "hidden", background: transparent ? "transparent" : "#000" }}>
      {!transparent && <Background style={style} live={live} />}
      {lowerThird && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "34%", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.85) 100%)" }} />}
      <div
        ref={boxRef}
        style={{
          position: "absolute",
          left: marginX,
          right: marginX,
          top: lowerThird ? Math.round(CANVAS_H * 0.68) : marginY,
          bottom: marginY,
          display: "flex",
          flexDirection: "column",
          justifyContent: lowerThird ? "center" : justify,
          alignItems: style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center",
          textAlign: style.align,
          overflow: "hidden",
        }}
      >
        <div ref={textRef} style={{ maxWidth: "100%" }}>
          {isLogo ? (
            <div style={{ fontSize: 140, fontWeight: 800, color: "#fff", padding: "40px 80px", borderRadius: 48, background: "rgba(255,255,255,0.1)" }}>WHQ</div>
          ) : (
            <>
              {style.sub.position === "above" && subEl}
              {mainEl}
              {style.sub.position === "below" && subEl}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One half of a two-version slide: the words and their version label, shrunk to fit. */
function FitBlock({ text, label, style }: { text: string; label: string; style: SlideStyle }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const mRef = useRef<HTMLParagraphElement>(null);
  const lRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current, inner = innerRef.current, m = mRef.current, l = lRef.current;
    if (!box || !inner || !m) return;
    let size = Math.round(style.fontSize * 0.85);
    const apply = () => { m.style.fontSize = `${size}px`; if (l) l.style.fontSize = `${Math.max(18, style.sub.size * 0.8 * (size / style.fontSize))}px`; };
    apply();
    let guard = 0;
    while ((inner.scrollHeight > box.clientHeight || inner.scrollWidth > box.clientWidth) && size > 20 && guard++ < 90) {
      size -= Math.max(2, Math.round(size * 0.05));
      apply();
    }
  }, [text, label, style]);
  return (
    <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center", textAlign: style.align, overflow: "hidden" }}>
      <div ref={innerRef} style={{ maxWidth: "100%" }}>
        <p ref={mRef} style={{ margin: 0, fontFamily: style.fontFamily, fontWeight: style.fontWeight, color: style.color, lineHeight: style.lineHeight, textTransform: style.uppercase ? "uppercase" : "none", textShadow: textShadowFor(style), whiteSpace: "pre-line" }}>{richText(text)}</p>
        {label && <p ref={lRef} style={{ margin: "0.4em 0 0", fontFamily: style.fontFamily, fontWeight: 700, color: style.sub.color, textShadow: textShadowFor(style) }}>{label}</p>}
      </div>
    </div>
  );
}

/**
 * Shows a SlideCanvas scaled to fit its container. `fill` centres it in a box of any shape
 * (the projector window); otherwise the box is 16:9 and the canvas fills it.
 */
export function ScaledSlide({
  slide, live = false, videoRef, className = "", fill = false, part = "full",
}: {
  slide: Slide;
  live?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  className?: string;
  fill?: boolean;
  part?: CanvasPart;
}) {
  const style = useSlideStyle(slide)!;
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = box.w && box.h ? Math.min(box.w / CANVAS_W, box.h / CANVAS_H) : 0;
  return (
    <div ref={ref} className={`relative overflow-hidden ${fill ? "h-full w-full" : "aspect-video w-full"} ${className}`} style={{ background: part === "foreground" ? "transparent" : "#000" }}>
      {scale > 0 && (
        <div
          style={{
            position: "absolute",
            left: (box.w - CANVAS_W * scale) / 2,
            top: (box.h - CANVAS_H * scale) / 2,
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <SlideCanvas slide={slide} style={style} live={live} videoRef={videoRef} part={part} />
        </div>
      )}
    </div>
  );
}
