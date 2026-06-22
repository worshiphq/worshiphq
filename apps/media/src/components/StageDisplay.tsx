import { useEffect, useState } from "react";
import type { Slide } from "../types";

export function StageDisplay() {
  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null);
  const [nextSlide, setNextSlide] = useState<Slide | null>(null);
  const [clock, setClock] = useState(new Date());
  const [serviceTimer, setServiceTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setServiceTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "stage-update") {
        setCurrentSlide(event.data.current);
        setNextSlide(event.data.next);
      }
      if (event.data?.type === "stage-notes") {
        setNotes(event.data.notes);
      }
      if (event.data?.type === "stage-timer") {
        setTimerRunning(event.data.running);
        if (event.data.reset) setServiceTimer(0);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-black p-6 text-white">
      {/* Header with clock */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white/60">STAGE DISPLAY</h1>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums">
              {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-xs text-white/40">
              {clock.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          {timerRunning && (
            <div className="rounded-lg bg-white/10 px-4 py-2 text-center">
              <div className="text-2xl font-bold tabular-nums text-amber-400">
                {formatTime(serviceTimer)}
              </div>
              <div className="text-[10px] uppercase text-white/40">Service Timer</div>
            </div>
          )}
        </div>
      </div>

      {/* Main content - current and next */}
      <div className="flex flex-1 gap-4">
        {/* Current slide */}
        <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="size-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              NOW
            </span>
          </div>
          {currentSlide ? (
            <div>
              <p className="text-3xl font-semibold leading-relaxed text-white" style={{ whiteSpace: "pre-line" }}>
                {currentSlide.content.primaryText}
              </p>
              {currentSlide.content.secondaryText && (
                <p className="mt-3 text-lg text-white/60">
                  {currentSlide.content.secondaryText}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xl text-white/20">No active slide</p>
          )}
        </div>

        {/* Next slide */}
        <div className="w-80 rounded-xl border border-white/10 bg-white/5 p-6">
          <span className="mb-3 block text-xs font-bold uppercase tracking-wider text-white/30">
            UP NEXT
          </span>
          {nextSlide ? (
            <div>
              <p className="text-lg leading-relaxed text-white/70" style={{ whiteSpace: "pre-line" }}>
                {nextSlide.content.primaryText}
              </p>
              {nextSlide.content.secondaryText && (
                <p className="mt-2 text-sm text-white/40">
                  {nextSlide.content.secondaryText}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/20">Nothing queued</p>
          )}
        </div>
      </div>

      {/* Notes bar */}
      {notes && (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <span className="text-[10px] font-bold uppercase text-amber-400/60">Operator Notes</span>
          <p className="text-sm text-amber-200">{notes}</p>
        </div>
      )}
    </div>
  );
}
