import { Monitor, Wifi, Settings, Minus, Square, X } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

export function TitleBar() {
  const isLive = useProjectionStore((s) => s.isLive);

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-3"
    >
      {/* Left: Brand */}
      <div className="flex items-center gap-4" data-tauri-drag-region>
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-dim shadow-md shadow-primary/20">
            <Monitor className="size-3.5 text-white" />
          </div>
          <span className="text-[13px] font-bold tracking-tight text-ink">
            Worship<span className="text-primary-bright">HQ</span>
            <span className="ml-1 text-[10px] font-medium text-ink-faint">Media 4</span>
          </span>
        </div>

        <nav className="flex items-center" data-tauri-drag-region>
          {["File", "Edit", "View", "Insert", "Tools", "Help"].map((item) => (
            <button
              key={item}
              className="rounded-md px-2.5 py-1 text-[11px] text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted"
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: Live status */}
      <div className="absolute left-1/2 -translate-x-1/2" data-tauri-drag-region>
        {isLive && (
          <div className="badge badge-live">
            <div className="live-dot size-1.5 rounded-full bg-danger" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
          </div>
        )}
      </div>

      {/* Right: Status + controls */}
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <div className="flex items-center gap-1.5 rounded-full bg-surface-4 px-2.5 py-1">
          <Wifi className="size-3 text-success" />
          <span className="text-[10px] text-ink-faint">Connected</span>
        </div>

        <button className="grid size-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
          <Settings className="size-3.5" />
        </button>

        <div className="ml-1 flex">
          <button className="grid size-8 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
            <Minus className="size-3.5" />
          </button>
          <button className="grid size-8 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
            <Square className="size-3" />
          </button>
          <button className="grid size-8 place-items-center rounded-md text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger">
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
