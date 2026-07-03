import { useEffect, useState } from "react";
import { Minus, X, Maximize2 } from "lucide-react";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!window.api?.onMaximizedChange) return;
    window.api.winIsMaximized().then(setMaximized);
    return window.api.onMaximizedChange(setMaximized);
  }, []);

  return (
    <div
      className="flex h-9 items-center justify-between border-b border-line bg-surface select-none"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      {/* Left: app icon + name */}
      <div className="flex items-center gap-2 pl-3">
        <img src="./icon.png" alt="" className="size-4 object-contain" />
        <span className="text-[11px] font-semibold text-ink-muted">WorshipHQ</span>
      </div>

      {/* Right: window controls */}
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button
          onClick={() => window.api?.winMinimize()}
          className="grid h-full w-11 place-items-center text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => window.api?.winMaximize()}
          className="grid h-full w-11 place-items-center text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
        >
          {maximized ? (
            <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="0" width="8" height="8" rx="1" />
              <rect x="0" y="2" width="8" height="8" rx="1" />
            </svg>
          ) : (
            <Maximize2 className="size-3" />
          )}
        </button>
        <button
          onClick={() => window.api?.winClose()}
          className="grid h-full w-11 place-items-center text-ink-faint transition-colors hover:bg-danger hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
