import { useEffect, useRef } from "react";
import { ChevronsRight, MonitorPlay } from "lucide-react";
import type { Slide } from "../types";
import { useShowStore, type SlideSet } from "../stores/show-store";
import { useProjectionStore } from "../stores/projection-store";
import { SlidePreview } from "./SlidePreview";
import { plainText } from "../lib/rich-text";

/** The first words of a slide, for the slide lists. */
function firstWords(s: Slide): string {
  if (s.media) return s.media.kind === "video" ? "Video" : "Picture";
  const t = plainText(s.content.primaryText ?? "").trim();
  return t ? t.split("\n").slice(0, 2).join(" / ") : s.background ? "Background" : s.label ?? "";
}

/**
 * Preview and Live side by side, always on top, like EasyWorship 2009.
 * Preview: click a slide to look at it, Enter or double-click to send it live.
 * Live: click a slide and it is on the screen.
 */
export function PreviewLive() {
  const { preview, live, setPreviewIndex, sendPreviewLive, liveGo } = useShowStore();
  const { currentSlide, isLive, isBlack, textCleared } = useProjectionStore();
  const onScreen = isLive && !isBlack ? currentSlide : null;

  return (
    <div className="grid h-[clamp(210px,34vh,380px)] shrink-0 grid-cols-2 gap-3 border-b border-line bg-surface px-3 py-2.5">
      <Panel
        kind="preview"
        set={preview}
        screen={preview ? preview.slides[preview.index] : null}
        empty="Click a song, verse, picture or background to see it here"
        onPick={setPreviewIndex}
        onSend={(i) => sendPreviewLive(i)}
      />
      <Panel
        kind="live"
        set={live}
        screen={onScreen}
        empty={isBlack ? "Black screen" : "Nothing on the screen"}
        note={isBlack ? "BLACK" : textCleared ? "WORDS CLEARED" : undefined}
        onPick={liveGo}
        onSend={liveGo}
      />
    </div>
  );
}

function Panel({ kind, set, screen, empty, note, onPick, onSend }: {
  kind: "preview" | "live";
  set: SlideSet | null;
  screen: Slide | null;
  empty: string;
  note?: string;
  onPick: (i: number) => void;
  onSend: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const isLivePanel = kind === "live";
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${set?.index ?? 0}"]`)?.scrollIntoView({ block: "nearest" });
  }, [set?.index, set?.slides]);

  return (
    <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-surface-2 shadow-sm ${isLivePanel ? "border-danger/40" : "border-line"}`}>
      <div className={`flex shrink-0 items-center gap-2 border-b px-3 py-1.5 ${isLivePanel ? "border-danger/20 bg-danger/5" : "border-line bg-surface-4/50"}`}>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${isLivePanel ? "bg-danger text-white" : "bg-primary text-white"}`}>{isLivePanel ? "Live" : "Preview"}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{set?.title ?? ""}</span>
        {note && <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{note}</span>}
        {!isLivePanel && set && (
          <button onClick={() => onSend(set.index)} title="Send to the screen (Enter)"
            className="flex h-7 items-center gap-1 rounded-md bg-danger px-2.5 text-[12px] font-bold text-white hover:brightness-110">
            Go live <ChevronsRight className="size-4" />
          </button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2 p-2">
        <div className="flex min-h-0 items-start justify-center">
          <div className="aspect-video max-h-full w-full" onDoubleClick={() => set && !isLivePanel && onSend(set.index)}>
            <SlidePreview slide={screen} placeholder={empty} highlight={isLivePanel && screen ? "live" : undefined} />
          </div>
        </div>
        <div
          ref={listRef}
          tabIndex={0}
          data-panel={kind}
          onKeyDown={(e) => {
            if (!set) return;
            if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); isLivePanel ? onSend(Math.min(set.slides.length - 1, set.index + 1)) : onPick(Math.min(set.slides.length - 1, set.index + 1)); }
            else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); isLivePanel ? onSend(Math.max(0, set.index - 1)) : onPick(Math.max(0, set.index - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onSend(set.index); }
          }}
          className="min-h-0 overflow-y-auto rounded-md border border-line bg-surface-4/30 outline-none focus:border-primary"
        >
          {!set ? (
            <p className="p-3 text-center text-[12px] text-ink-faint">{isLivePanel ? "What is on the screen appears here." : "Nothing in preview."}</p>
          ) : (
            set.slides.map((s, i) => {
              const on = i === set.index;
              return (
                <div
                  key={i}
                  data-i={i}
                  onClick={() => (isLivePanel ? onSend(i) : onPick(i))}
                  onDoubleClick={() => onSend(i)}
                  className={`flex cursor-pointer select-none items-start gap-2 border-b border-line/60 px-2 py-1.5 text-[12px] last:border-0 ${
                    on ? (isLivePanel ? "bg-danger text-white" : "bg-primary text-white") : "text-ink hover:bg-surface-2"
                  }`}
                >
                  <span className={`w-5 shrink-0 text-right font-mono ${on ? "text-white/80" : "text-ink-faint"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    {s.label && <span className={`block truncate text-[10px] font-bold uppercase tracking-wide ${on ? "text-white/80" : "text-ink-muted"}`}>{s.label}</span>}
                    <span className="line-clamp-2">{firstWords(s)}</span>
                  </span>
                  {!isLivePanel && !on && <MonitorPlay className="mt-0.5 size-3.5 shrink-0 opacity-0" />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
