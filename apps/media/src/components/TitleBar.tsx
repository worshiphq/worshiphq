import { Monitor, Wifi, WifiOff, Settings, ChevronDown } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

export function TitleBar() {
  const isLive = useProjectionStore((s) => s.isLive);

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-2"
    >
      {/* Left: Brand + menu */}
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <div className="flex items-center gap-1.5 pl-1">
          <div className="grid size-5 place-items-center rounded bg-primary/25">
            <Monitor className="size-3 text-primary-bright" />
          </div>
          <span className="text-[11px] font-bold tracking-tight text-ink">
            WorshipHQ<span className="text-primary-bright"> Media 4</span>
          </span>
        </div>

        <nav className="flex items-center gap-0.5" data-tauri-drag-region>
          {["Library", "Schedule", "Display", "Media", "Audio", "System"].map((item) => (
            <button
              key={item}
              className="rounded px-2 py-1 text-[11px] text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted"
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-4" data-tauri-drag-region>
        {isLive && (
          <div className="flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-0.5">
            <div className="live-dot size-1.5 rounded-full bg-danger" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-danger">Live</span>
          </div>
        )}
      </div>

      {/* Right: Connection + user + window controls */}
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <div className="flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1">
          <Wifi className="size-3 text-success" />
          <span className="text-[10px] text-ink-faint">Connected</span>
        </div>

        <button className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
          <Settings className="size-3.5" />
        </button>

        <div className="ml-1 flex gap-1">
          <button className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
          </button>
          <button className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-4 hover:text-ink-muted">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
          </button>
          <button className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-danger/20 hover:text-danger">
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
