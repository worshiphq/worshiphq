import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Pause, Play, Repeat } from "lucide-react";
import type { Slide } from "../types";
import { useMediaStore } from "../stores/media-store";
import { useProjectionStore } from "../stores/projection-store";
import { buildMediaSlide, defaultMediaOptions } from "../lib/media-slides";
import { mediaUrl } from "../lib/media-src";

/**
 * Before the service: announcement pictures turn over by themselves every few seconds, with a countdown to the
 * start of the service between them. Anything else sent to the screen stops the loop.
 */
interface LoopState {
  running: boolean;
  slides: Slide[];
  index: number;
  timer: number | null;
  start: (slides: Slide[], seconds: number) => void;
  stop: () => void;
}

export const useLoopStore = create<LoopState>()((set, get) => ({
  running: false,
  slides: [],
  index: 0,
  timer: null,
  start: (slides, seconds) => {
    get().stop();
    if (!slides.length) return;
    const p = useProjectionStore.getState();
    if ((window as any).__TAURI_INTERNALS__ && !p.projectionOpen) p.openProjection();
    p.goLive(slides[0]);
    const timer = window.setInterval(() => {
      const { slides: list, index, running } = get();
      if (!running) return;
      const next = (index + 1) % list.length;
      set({ index: next });
      useProjectionStore.getState().goLive(list[next]);
    }, Math.max(3, seconds) * 1000);
    set({ running: true, slides, index: 0, timer });
  },
  stop: () => {
    const t = get().timer;
    if (t) window.clearInterval(t);
    set({ running: false, timer: null });
  },
}));

// Something else went on screen: the loop stops.
useProjectionStore.subscribe((state, prev) => {
  const loop = useLoopStore.getState();
  if (!loop.running || state.currentSlide === prev.currentSlide) return;
  if (!loop.slides.includes(state.currentSlide as Slide)) loop.stop();
});

const KEY = "whq-loop";

export function AnnouncementLoop() {
  const items = useMediaStore((s) => s.items);
  const { serviceDate, startTime } = useProjectionStore();
  const { running, index, slides, start, stop } = useLoopStore();
  const pictures = useMemo(() => items.filter((i) => i.kind === "image"), [items]);
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } }, []);
  const [picked, setPicked] = useState<string[]>(saved.picked ?? []);
  const [seconds, setSeconds] = useState<number>(saved.seconds ?? 8);
  const [withCountdown, setWithCountdown] = useState<boolean>(saved.countdown ?? true);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ picked, seconds, countdown: withCountdown })); } catch { /* ignore */ } }, [picked, seconds, withCountdown]);

  function go() {
    const chosen = pictures.filter((p) => picked.includes(p.id)).map((p) => buildMediaSlide(p, defaultMediaOptions(p)));
    const list: Slide[] = [];
    // The countdown runs to the service start time set in Plan the service.
    const [h, m] = startTime.split(":").map(Number);
    const at = new Date(`${serviceDate}T00:00:00`); at.setHours(h || 9, m || 0, 0, 0);
    const countdown: Slide | null = withCountdown && at.getTime() > Date.now()
      ? { type: "announcement", label: "Countdown", countdownTo: at.getTime(), content: { primaryText: "Welcome", secondaryText: "The service starts in" }, template: { background: "#000", textLayout: "center" } }
      : null;
    for (const s of chosen) { list.push(s); if (countdown) list.push(countdown); }
    if (!chosen.length && countdown) list.push(countdown);
    start(list, seconds);
  }

  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Repeat className="size-4 text-primary-bright" />
        <h3 className="flex-1 text-[15px] font-semibold text-ink">Announcement loop</h3>
        {running && <span className="rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">RUNNING · {index + 1}/{slides.length}</span>}
      </div>
      {pictures.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Add your announcement pictures in Media first (File › Add pictures).</p>
      ) : (
        <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto">
          {pictures.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button key={p.id} title={p.name} onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
                className={`relative aspect-video overflow-hidden rounded-md ${on ? "ring-2 ring-primary" : "opacity-60 ring-1 ring-line hover:opacity-100"}`}>
                <img src={mediaUrl(p.path)} alt="" className="h-full w-full object-cover" loading="lazy" />
                {on && <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">{picked.indexOf(p.id) + 1}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-ink">
        <label className="flex items-center gap-1.5">Each for
          <input type="number" min={3} max={120} value={seconds} onChange={(e) => setSeconds(Math.max(3, Number(e.target.value) || 8))} className="h-8 w-14 rounded-md border border-line-bright px-1.5" /> s
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={withCountdown} onChange={(e) => setWithCountdown(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
          Countdown to {startTime} between pictures
        </label>
      </div>
      <button onClick={() => (running ? stop() : go())} disabled={!running && !picked.length && !withCountdown}
        className={`mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-bold text-white disabled:opacity-40 ${running ? "bg-ink" : "bg-primary hover:bg-primary-bright"}`}>
        {running ? <><Pause className="size-4" /> Stop the loop</> : <><Play className="size-4" /> Start the loop</>}
      </button>
      <p className="mt-1.5 text-[12px] text-ink-faint">Sending anything else to the screen stops the loop.</p>
    </section>
  );
}
