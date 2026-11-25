import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { useShowStore } from "../stores/show-store";
import { SlidePreview } from "./SlidePreview";
import { partColor } from "../lib/part-colors";

/** Every slide of the whole schedule on one page: one click puts any of them on the screen. */
export function WholeSchedule({ onClose }: { onClose: () => void }) {
  const items = useProjectionStore((s) => s.serviceItems);
  const onAir = useProjectionStore((s) => (s.isLive && !s.isBlack ? s.currentSlide : null));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    box.current?.querySelector("[data-live]")?.scrollIntoView({ block: "center" });
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  function show(i: number, k: number) {
    const it = items[i];
    useProjectionStore.getState().setActiveItem(i);
    useShowStore.getState().setPreview(it.title, it.slides!, k, it.data?.songId);
    useShowStore.getState().sendPreviewLive(k);
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Whole schedule" className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
        <h2 className="flex-1 text-[17px] font-bold text-ink">Whole schedule <span className="ml-2 text-[13px] font-normal text-ink-muted">Click any slide to show it. Right arrow and left arrow move on as usual.</span></h2>
        <button onClick={onClose} aria-label="Close" title="Close (Esc)" className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-4 hover:text-ink"><X className="size-5" /></button>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto p-4">
        {items.length === 0 && <p className="p-10 text-center text-[14px] text-ink-muted">The schedule is empty.</p>}
        {items.map((it, i) => (
          <section key={it.id} className="mb-5">
            <h3 className="mb-2 text-[14px] font-bold text-ink">{i + 1}. {it.title}</h3>
            {!it.slides?.length ? <p className="text-[13px] text-ink-faint">Nothing to show.</p> : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5">
                {it.slides.map((s, k) => {
                  const live = onAir === s;
                  const c = partColor(s.label);
                  return (
                    <button key={k} data-live={live || undefined} onClick={() => show(i, k)} className={`overflow-hidden rounded-lg border-2 text-left ${live ? "border-danger" : "border-line hover:border-primary"}`}>
                      <SlidePreview slide={s} className="rounded-none" />
                      <span className="flex items-center gap-1.5 bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink-muted">
                        {c && <span className="size-2 rounded-full" style={{ background: c }} />}
                        <span className="truncate">{s.label ?? k + 1}</span>
                        {live && <span className="ml-auto text-danger">ON SCREEN</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
