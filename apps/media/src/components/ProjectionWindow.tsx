import { useEffect, useRef, useState } from "react";
import type { Slide, AlertMessage } from "../types";
import { useProjectionStore } from "../stores/projection-store";
import { ScaledSlide, CANVAS_W } from "./SlideCanvas";
import { DEFAULT_TRANSITION, themeKindFor, DEFAULT_THEMES, type Transition } from "../lib/themes";

interface Layer { id: number; slide: Slide | null; transition: Transition; done: boolean }

/** What makes two slides share a background: then it stays still while only the words change. */
function backgroundKey(slide: Slide | null): string {
  if (!slide) return "none";
  if (slide.media) return `media:${slide.media.src}:${slide.media.fit}`;
  const bg = (slide.style ?? DEFAULT_THEMES[themeKindFor(slide.type)]).background;
  return `bg:${bg.kind}:${bg.value}:${bg.dim}`;
}

let layerId = 0;

/** A stack of layers: the newest animates in on top; once it has, the older ones are removed. */
function useLayers() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const push = (slide: Slide | null, transition: Transition) =>
    setLayers((ls) => [...ls.slice(-2), { id: ++layerId, slide, transition, done: transition.kind === "cut" }]);
  const finished = (id: number) => setLayers((ls) => {
    const i = ls.findIndex((l) => l.id === id);
    return i < 0 ? ls : ls.slice(i).map((l, j) => (j === 0 ? { ...l, done: true } : l));
  });
  return { layers, push, finished };
}

/** The window on the projector / TV. It only shows what the operator sends. */
export function ProjectionWindow() {
  const [slide, setSlide] = useState<Slide | null>(null);
  const bg = useLayers();
  const fg = useLayers();
  const lastBgKey = useRef<string>("none");
  const lastTransition = useRef<Transition>(DEFAULT_TRANSITION);
  const [isBlack, setIsBlack] = useState(false);
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const isTrial = useProjectionStore((s) => s.isTrial);
  const isLicensed = useProjectionStore((s) => s.isLicensed);
  const videoRef = useRef<HTMLVideoElement>(null);

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
          const hwid = await invoke<string>("get_hwid");
          const lic = await invoke<{ is_licensed: boolean; is_trial: boolean; trial_days_remaining: number; hwid: string }>("check_license", { hwid });
          useProjectionStore.getState().setLicense({ isLicensed: lic.is_licensed, isTrial: lic.is_trial, trialDaysRemaining: lic.trial_days_remaining, hwid: lic.hwid });
        } catch { /* keep the default */ }

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

  return (
    <div className="relative h-screen w-screen cursor-none overflow-hidden bg-black">
      {bg.layers.map((l, i) => (
        <LayerView key={l.id} layer={l} leaving={i < bg.layers.length - 1} onDone={() => bg.finished(l.id)}>
          {l.slide && <ScaledSlide slide={l.slide} live fill part="background" videoRef={i === bg.layers.length - 1 ? videoRef : undefined} />}
        </LayerView>
      ))}
      {fg.layers.map((l, i) => (
        <LayerView key={l.id} layer={l} leaving={i < fg.layers.length - 1} onDone={() => fg.finished(l.id)}>
          {l.slide && !l.slide.media && <ScaledSlide slide={l.slide} live fill part="foreground" />}
        </LayerView>
      ))}
      <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${isBlack ? "opacity-100" : "opacity-0"}`} />
      {alert && <AlertBar alert={alert} />}
      {isTrial && !isLicensed && <TrialWatermark />}
    </div>
  );
}

/** One layer, animating in with its transition. Layers underneath it are removed once it has finished. */
function LayerView({ layer, leaving, onDone, children }: { layer: Layer; leaving: boolean; onDone: () => void; children: React.ReactNode }) {
  const { kind, ms } = layer.transition;
  useEffect(() => {
    if (layer.done) return;
    const t = window.setTimeout(onDone, kind === "cut" ? 0 : ms + 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const anim = kind === "cut" || layer.done ? undefined : `whq-in-${kind} ${ms}ms ease-out both`;
  // Fade through black: the old layer fades away first.
  const out = leaving && kind === "fade-black" ? `whq-out-fade ${Math.round(ms / 2)}ms ease-in both` : undefined;
  return (
    <div className="absolute inset-0" style={{ animation: out ?? anim, willChange: "opacity, transform" }} data-width={CANVAS_W}>
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
        WorshipHQ Media — Trial
      </div>
    </div>
  );
}
