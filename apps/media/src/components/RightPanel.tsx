import { Monitor, MonitorOff, ChevronDown, Sliders } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import type { Slide } from "../types";

export function RightPanel() {
  const { currentSlide, isLive, isBlack } = useProjectionStore();

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l border-line bg-surface-2">
      {/* Live Output preview */}
      <div className="shrink-0 border-b border-line p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isLive && <div className="live-dot size-1.5 rounded-full bg-danger" />}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Live Output
            </span>
          </div>
          <span className="text-[9px] text-ink-faint">
            {isLive ? "LIVE" : "OFF"}
          </span>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
          {isBlack ? (
            <div className="grid h-full place-items-center">
              <MonitorOff className="size-5 text-ink-faint/20" />
            </div>
          ) : currentSlide ? (
            <OutputPreview slide={currentSlide} />
          ) : (
            <div className="grid h-full place-items-center">
              <Monitor className="size-5 text-ink-faint/15" />
            </div>
          )}
          {isLive && !isBlack && (
            <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-danger/80 px-1 py-0.5">
              <div className="live-dot size-1 rounded-full bg-white" />
              <span className="text-[7px] font-bold text-white">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Properties */}
      <div className="shrink-0 border-b border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders className="size-3 text-ink-faint" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Properties</span>
          </div>
          <button className="text-[9px] text-primary-bright">Edit</button>
        </div>

        <div className="space-y-1.5">
          <PropRow label="Text" value={currentSlide?.content.primaryText?.slice(0, 30) ?? "—"} />
          <PropRow label="Verse" value={currentSlide?.content.secondaryText ?? "—"} />
          <PropRow label="Font" value={currentSlide?.template.fontFamily ?? "Open Sans, 48pt, White"} />
          <PropRow label="Background" value={typeof currentSlide?.template.background === "string" ? "Solid Color" : "Video"} />
          <PropRow label="Alignment" value={currentSlide?.template.textLayout === "center" ? "Center" : currentSlide?.template.textLayout ?? "Center"} />
          <PropRow label="Transitions" value="Fade 1s" />
        </div>
      </div>

      {/* Live Monitor */}
      <div className="shrink-0 border-b border-line p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Monitor className="size-3 text-ink-faint" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Live Monitor</span>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
          {currentSlide && !isBlack ? (
            <OutputPreview slide={currentSlide} />
          ) : (
            <div className="grid h-full place-items-center">
              <span className="text-[9px] text-ink-faint/30">Stage view</span>
            </div>
          )}
        </div>
      </div>

      {/* Analytics */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Analytics</span>
          <div className="flex gap-1">
            <span className="text-[9px] text-ink-faint">Overview</span>
            <span className="text-[9px] text-primary-bright">Cloud Sync</span>
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          <div className="flex-1 rounded-lg border border-line bg-surface-3 p-2 text-center">
            <div className="text-sm font-bold text-ink">47</div>
            <div className="text-[9px] text-ink-faint">Slides shown</div>
          </div>
          <div className="flex-1 rounded-lg border border-line bg-surface-3 p-2 text-center">
            <div className="text-sm font-bold text-success">1:42:30</div>
            <div className="text-[9px] text-ink-faint">Session time</div>
          </div>
        </div>

        {/* Mini chart placeholder */}
        <div className="rounded-lg border border-line bg-surface-3 p-2">
          <div className="mb-1 text-[9px] text-ink-faint">Usage this week</div>
          <div className="flex h-12 items-end gap-1">
            {[30, 65, 45, 80, 55, 70, 40].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/30"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[8px] text-ink-faint/50">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-3 px-2 py-1.5">
          <span className="text-[10px] text-ink-faint">Cloud Sync</span>
          <span className="text-[9px] font-medium text-success">UP-TO-DATE</span>
        </div>
      </div>
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-ink-faint">{label}</span>
      <div className="flex items-center gap-1">
        <span className="max-w-[120px] truncate text-[10px] text-ink-muted">{value}</span>
        <ChevronDown className="size-2.5 text-ink-faint" />
      </div>
    </div>
  );
}

function OutputPreview({ slide }: { slide: Slide }) {
  const bg = typeof slide.template.background === "string" ? slide.template.background : "#000";
  return (
    <div className="flex h-full w-full items-center justify-center p-2" style={{ backgroundColor: bg }}>
      {slide.type === "logo" ? (
        <span className="text-xs font-bold text-white/50">WHQ</span>
      ) : (
        <div className="text-center">
          <p className="line-clamp-3 text-[7px] font-medium leading-snug text-white/80">
            {slide.content.primaryText}
          </p>
          {slide.content.secondaryText && (
            <p className="mt-0.5 text-[6px] text-white/50">{slide.content.secondaryText}</p>
          )}
        </div>
      )}
    </div>
  );
}
