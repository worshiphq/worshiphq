import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, MonitorPlay, X } from "lucide-react";
import { useVoiceStore } from "../stores/voice-store";

/**
 * Pops up on every screen when the voice assistant hears a verse,
 * and offers Back / Next while a long passage it showed is on screen.
 */
export function VoiceBanner() {
  const { pending, mode, autoDelay, showDetection, dismiss, shown, showPart, closeShown } = useVoiceStore();
  const [left, setLeft] = useState(autoDelay);

  // Countdown for automatic mode; banner goes away by itself after a while in "ask" mode.
  useEffect(() => {
    if (!pending) return;
    if (mode === "auto") {
      setLeft(autoDelay);
      const started = Date.now();
      const t = window.setInterval(() => {
        const remaining = autoDelay - Math.floor((Date.now() - started) / 1000);
        setLeft(remaining);
        if (remaining <= 0) { window.clearInterval(t); showDetection(pending.id); }
      }, 200);
      return () => window.clearInterval(t);
    }
    const t = window.setTimeout(() => dismiss(pending.id), 30_000);
    return () => window.clearTimeout(t);
  }, [pending, mode, autoDelay, showDetection, dismiss]);

  // Space = show, Esc = not now (only while the banner is up, and not while typing).
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); dismiss(pending.id); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); showDetection(pending.id); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending, showDetection, dismiss]);

  if (pending) {
    return (
      <div role="alert" className="fade-in flex shrink-0 items-center gap-3 border-b border-primary/30 bg-primary-soft px-4 py-2.5">
        <BookOpen className="size-5 shrink-0 text-primary-bright" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">
            Heard: {pending.label}
            {mode === "auto" && <span className="ml-2 font-semibold text-primary-bright">showing in {Math.max(left, 0)}…</span>}
          </div>
          <div className="truncate text-[13px] text-ink-muted">“{pending.said}”</div>
        </div>
        <button onClick={() => showDetection(pending.id)} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright">
          <MonitorPlay className="size-4" /> {mode === "auto" ? "Show now" : "Show"} <kbd className="rounded bg-white/20 px-1.5 text-[11px]">Space</kbd>
        </button>
        <button onClick={() => dismiss(pending.id)} className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-ink-muted hover:bg-surface-2">
          Not now <kbd className="rounded bg-surface-4 px-1.5 text-[11px]">Esc</kbd>
        </button>
      </div>
    );
  }

  if (shown && shown.slides.length > 1) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-4 py-2">
        <BookOpen className="size-4 text-primary-bright" />
        <span className="flex-1 text-[14px] text-ink">
          <b>{shown.label}</b> is on screen · part {shown.index + 1} of {shown.slides.length}
        </span>
        <button onClick={() => showPart(shown.index - 1)} disabled={shown.index === 0} className="flex h-9 items-center gap-1 rounded-lg bg-surface-4 px-3 text-[13px] font-semibold text-ink hover:bg-surface-5 disabled:text-ink-faint">
          <ChevronLeft className="size-4" /> Back
        </button>
        <button onClick={() => showPart(shown.index + 1)} disabled={shown.index === shown.slides.length - 1} className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">
          Next <ChevronRight className="size-4" />
        </button>
        <button onClick={closeShown} aria-label="Hide" className="grid size-9 place-items-center rounded-lg text-ink-faint hover:bg-surface-4"><X className="size-4" /></button>
      </div>
    );
  }
  return null;
}
