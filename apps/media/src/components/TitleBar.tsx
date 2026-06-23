import { Minus, Square, X } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

export function TitleBar() {
  const isLive = useProjectionStore((s) => s.isLive);

  return (
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-3"
    >
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <div className="flex items-center gap-2">
          <div className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-primary to-primary-dim">
            <span className="text-[8px] font-black text-white">W</span>
          </div>
          <span className="text-[12px] font-bold tracking-tight text-ink">
            Worship<span className="text-primary-bright">HQ</span>
            <span className="ml-1 text-[9px] font-medium text-ink-faint">Media 4</span>
          </span>
        </div>

        <nav className="flex items-center" data-tauri-drag-region>
          {["File", "Schedule", "Songs", "Live", "Profiles", "Help"].map((item) => (
            <button
              key={item}
              className="rounded px-2 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-surface-4 hover:text-ink"
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1" data-tauri-drag-region>
        {isLive && (
          <div className="mr-2 flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-0.5">
            <div className="live-dot size-1.5 rounded-full bg-danger" />
            <span className="text-[9px] font-bold text-danger">LIVE</span>
          </div>
        )}
        <span className="mr-2 text-[9px] text-ink-faint">v4.0 — Default Profile</span>
        <button className="grid size-7 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
          <Minus className="size-3.5" />
        </button>
        <button className="grid size-7 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
          <Square className="size-3" />
        </button>
        <button className="grid size-7 place-items-center rounded text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
