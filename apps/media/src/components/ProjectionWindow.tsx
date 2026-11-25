import { useEffect, useRef, useState } from "react";
import type { Slide, AlertMessage } from "../types";
import { DEFAULT_ADJUST, DEFAULT_PROP, DEFAULT_TICKER, type Adjust, type Prop, type Ticker } from "../stores/extras-store";
import { mediaUrl } from "../lib/media-src";
import { useProjectionStore } from "../stores/projection-store";
import { ScaledSlide, CANVAS_W } from "./SlideCanvas";
import { useAccountStore } from "../lib/account";
import { refreshLicence } from "../lib/licence";
import { DEFAULT_TRANSITION, themeKindFor, DEFAULT_THEMES, type Transition } from "../lib/themes";

interface Layer { id: number; slide: Slide | null; transition: Transition; leaving: boolean }

/** What makes two slides share a background: then it stays still while only the words change. */
function backgroundKey(slide: Slide | null): string {
  if (!slide) return "none";
  if (slide.media) return `media:${slide.media.src}:${slide.media.fit}`;
  const bg = (slide.style ?? DEFAULT_THEMES[themeKindFor(slide.type)]).background;
  return `bg:${bg.kind}:${bg.value}:${bg.dim}`;
}

let layerId = 0;

/**
 * A stack of layers. The newest animates in on top while the older ones are marked "leaving";
 * after the transition every older layer is removed, so at most two are ever on screen together.
 * Cut replaces straight away.
 */
function useLayers() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const push = (slide: Slide | null, transition: Transition) => {
    const id = ++layerId;
    window.clearTimeout(timer.current);
    if (transition.kind === "cut" || transition.ms <= 0) {
      setLayers([{ id, slide, transition, leaving: false }]);
      return;
    }
    // Only the newest previous layer stays to animate out; anything older goes now (fast clicking).
    setLayers((ls) => [...ls.slice(-1).map((l) => ({ ...l, leaving: true })), { id, slide, transition, leaving: false }]);
    timer.current = window.setTimeout(() => setLayers((ls) => ls.filter((l) => l.id >= id)), transition.ms + 60);
  };
  return { layers, push };
}

/** The window on the projector / TV. It only shows what the operator sends. */
export function ProjectionWindow() {
  const [ticker, setTicker] = useState<Ticker>(DEFAULT_TICKER);
  const [prop, setProp] = useState<Prop>(DEFAULT_PROP);
  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST);
  const applyExtra = (kind: string, value: unknown) => {
    if (kind === "ticker") setTicker({ ...DEFAULT_TICKER, ...(value as Ticker) });
    else if (kind === "prop") setProp({ ...DEFAULT_PROP, ...(value as Prop) });
    else if (kind === "adjust") setAdjust({ ...DEFAULT_ADJUST, ...(value as Adjust) });
  };
  const [slide, setSlide] = useState<Slide | null>(null);
  const bg = useLayers();
  const fg = useLayers();
  const lastBgKey = useRef<string>("none");
  const lastTransition = useRef<Transition>(DEFAULT_TRANSITION);
  const [isBlack, setIsBlack] = useState(false);
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const isTrial = useProjectionStore((s) => s.isTrial);
  const isLicensed = useProjectionStore((s) => s.isLicensed);
  // Signing in happens in the main window; pick it up here too.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === "whq-account") { useAccountStore.persist.rehydrate(); refreshLicence(); } };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Esc brings the operator's window back (like EasyWorship); double-click fills the screen when there is only one.
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const call = (cmd: string) => import("@tauri-apps/api/core").then(({ invoke }) => invoke(cmd)).catch(() => {});
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); call("leave_projector"); } };
    const dbl = () => call("projector_full");
    window.addEventListener("keydown", key);
    window.addEventListener("dblclick", dbl);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("dblclick", dbl); };
  }, []);

  useEffect(() => {
    let cleanup: (() => void)[] = [];
    let cancelled = false;

    const show = (s: Slide | null) => {
      const t = s?.transition ?? lastTransition.current;
      lastTransition.current = t;
      setSlide(s);
      setIsBlack(false);
      const key = backgroundKey(s);
      if (key !== lastBgKey.current) {
        lastBgKey.current = key;
        // A new background dissolves (other transitions apply to the words).
        bg.push(s, t.kind === "cut" ? t : { kind: t.kind === "fade-black" ? "fade-black" : "dissolve", ms: t.ms });
      }
      fg.push(s, t);
    };

    async function init() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { invoke } = await import("@tauri-apps/api/core");
        const u1 = await listen<string>("slide-update", (e) => {
          try { show(JSON.parse(e.payload) as Slide); } catch { /* ignore bad data */ }
        });
        const u2 = await listen("go-black", () => setIsBlack(true));
        const u3 = await listen("go-clear", () => show(null));
        const u4 = await listen<string>("media-control", (e) => {
          const v = videoRef.current;
          if (!v) return;
          if (e.payload === "play") v.play().catch(() => {});
          else if (e.payload === "pause") v.pause();
          else if (e.payload === "restart") { v.currentTime = 0; v.play().catch(() => {}); }
        });
        const u5 = await listen<string>("alert-update", (e) => {
          try { const a = JSON.parse(e.payload) as AlertMessage; setAlert(a?.text ? a : null); } catch { /* ignore */ }
        });
        cleanup = [u1, u2, u3, u4, u5];
        const savedAlert = await invoke<string | null>("get_alert_state").catch(() => null);
        if (savedAlert) { try { const a = JSON.parse(savedAlert) as AlertMessage; setAlert(a?.text ? a : null); } catch { /* ignore */ } }
        if (cancelled) cleanup.forEach((f) => f());

        // This window has its own copy of the app state, so check the licence here too (for the trial mark).
        try {
          await refreshLicence();
        } catch { /* keep the default */ }

        // Ticker, props and screen tuning.
        const u6 = await listen<string>("extra-update", (e) => {
          try { const { kind, json } = JSON.parse(e.payload); applyExtra(kind, JSON.parse(json)); } catch { /* ignore */ }
        });
        cleanup.push(u6);
        const extras = await invoke<Record<string, string>>("get_extras").catch(() => ({} as Record<string, string>));
        for (const [k, v] of Object.entries(extras)) { try { applyExtra(k, JSON.parse(v)); } catch { /* ignore */ } }

        // Opened after something was already sent? Catch up.
        const state = await invoke<{ slide: string | null; black: boolean }>("get_output_state");
        if (state.slide) {
          try { show(JSON.parse(state.slide) as Slide); } catch { /* ignore */ }
        }
        if (state.black) setIsBlack(true);
      } catch {
        // Browser preview: nothing to listen to.
      }
    }
    init();

    // Browser preview fallback
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "slide-update") show(event.data.slide);
      else if (event.data?.type === "go-black") setIsBlack(true);
      else if (event.data?.type === "go-clear") show(null);
    };
    window.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      cleanup.forEach((fn) => fn());
    };
  }, []);

  const adjustStyle = adjust.x || adjust.y || adjust.scale !== 1 || adjust.keystone || adjust.tilt
    ? { transform: `translate(${adjust.x}%, ${adjust.y}%) perspective(1200px) rotateX(${adjust.keystone}deg) rotateY(${adjust.tilt}deg) scale(${adjust.scale})`, transformOrigin: "center" }
    : undefined;
  return (
    <div className="h-screen w-screen cursor-none overflow-hidden bg-black">
    <div className="relative h-screen w-screen overflow-hidden bg-black" style={adjustStyle}>
      {bg.layers.map((l, i) => (
        <LayerView key={l.id} layer={l} solid>
          {l.slide && <ScaledSlide slide={l.slide} live fill part="background" videoRef={i === bg.layers.length - 1 ? videoRef : undefined} />}
        </LayerView>
      ))}
      {fg.layers.map((l) => (
        <LayerView key={l.id} layer={l}>
          {l.slide && !l.slide.media && <ScaledSlide slide={l.slide} live fill part="foreground" />}
        </LayerView>
      ))}
      <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${isBlack ? "opacity-100" : "opacity-0"}`} />
      {prop.on && !isBlack && <PropLayer prop={prop} />}
      {ticker.on && ticker.text.trim() && !isBlack && <TickerBand ticker={ticker} raised={!!alert} />}
      {alert && <AlertBar alert={alert} />}
      {(!isLicensed || isTrial) && <TrialWatermark />}
    </div>
    </div>
  );
}

/** Words that keep scrolling along the bottom (announcements), above any alert. */
function TickerBand({ ticker, raised }: { ticker: Ticker; raised: boolean }) {
  return (
    <div className="absolute inset-x-0 z-30 overflow-hidden" style={{ bottom: raised ? "5.6vw" : 0, background: ticker.background, color: ticker.color, padding: "0.7vw 0", fontSize: "1.9vw", fontWeight: 600, fontFamily: "'Segoe UI', sans-serif" }}>
      <div className="whitespace-nowrap" style={{ display: "inline-block", animation: `alert-scroll ${Math.max(5, ticker.seconds)}s linear infinite` }}>
        {ticker.text}
      </div>
    </div>
  );
}

/** Stays on top of every slide: a corner logo, or a lower-third title. */
function PropLayer({ prop }: { prop: Prop }) {
  const pos: React.CSSProperties = {
    position: "absolute", zIndex: 25,
    ...(prop.corner.startsWith("top") ? { top: "3vw" } : { bottom: "3vw" }),
    ...(prop.corner.endsWith("left") ? { left: "3vw" } : { right: "3vw" }),
  };
  if (prop.kind === "logo") {
    if (!prop.image) return null;
    return <img src={mediaUrl(prop.image)} alt="" style={{ ...pos, width: `${Math.round(prop.size * 100)}vw`, opacity: prop.opacity }} />;
  }
  if (!prop.title?.trim()) return null;
  return (
    <div style={{ position: "absolute", zIndex: 25, left: "4vw", bottom: "4vw", maxWidth: "70vw", opacity: prop.opacity, fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "rgba(13,148,136,0.95)", color: "#fff", padding: "0.8vw 2vw", fontSize: "2.4vw", fontWeight: 800, borderRadius: "0.4vw 0.4vw 0 0", display: "inline-block" }}>{prop.title}</div>
      {prop.subtitle?.trim() && <div style={{ background: "rgba(15,23,42,0.92)", color: "#e2e8f0", padding: "0.6vw 2vw", fontSize: "1.6vw", fontWeight: 600, borderRadius: "0 0.4vw 0.4vw 0.4vw" }}>{prop.subtitle}</div>}
    </div>
  );
}

/**
 * One layer. The new one animates in; the one it replaces animates out at the same time.
 * Backgrounds are solid, so the old background simply stays underneath until the new one has covered it
 * (no dip to black). Words are see-through, so the old words fade out while the new words fade in.
 */
function LayerView({ layer, solid = false, children }: { layer: Layer; solid?: boolean; children: React.ReactNode }) {
  const { kind, ms } = layer.transition;
  let animation: string | undefined;
  if (kind !== "cut") {
    if (!layer.leaving) animation = `whq-in-${kind} ${ms}ms ease-out both`;
    else if (kind === "fade-black") animation = `whq-out-fade ${Math.round(ms / 2)}ms ease-in both`;
    else if (!solid) animation = `whq-out-${kind === "push-left" ? "push-left" : "fade"} ${ms}ms ease-in both`;
  }
  return (
    <div className="absolute inset-0" style={{ animation, willChange: "opacity, transform" }} data-width={CANVAS_W} data-leaving={layer.leaving ? "1" : undefined}>
      {children}
    </div>
  );
}

function AlertBar({ alert }: { alert: AlertMessage }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 overflow-hidden" style={{ background: alert.background, color: alert.color, padding: "1.2vw 0", fontSize: "2.6vw", fontWeight: 700, fontFamily: "'Segoe UI', sans-serif" }}>
      {alert.scroll ? (
        <div className="alert-scroll whitespace-nowrap">{alert.text}</div>
      ) : (
        <div className="px-[3vw] text-center">{alert.text}</div>
      )}
    </div>
  );
}

function TrialWatermark() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div className="select-none text-white/[0.08]" style={{ fontSize: "5vw", fontWeight: 800, transform: "rotate(-30deg)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        WorshipHQ Live — Trial
      </div>
    </div>
  );
}
