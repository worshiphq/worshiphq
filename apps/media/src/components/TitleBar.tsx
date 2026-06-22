import { Monitor, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

export function TitleBar() {
  const [isOnline] = useState(true);

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-3"
    >
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <div className="grid size-6 place-items-center rounded-md bg-primary/20">
          <Monitor className="size-3.5 text-primary-bright" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-ink">
          WorshipHQ Media
        </span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-ink-faint">
          BETA
        </span>
      </div>

      <div className="flex items-center gap-3" data-tauri-drag-region>
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <>
              <Wifi className="size-3.5 text-success" />
              <span className="text-[11px] text-success">Synced</span>
            </>
          ) : (
            <>
              <WifiOff className="size-3.5 text-gold" />
              <span className="text-[11px] text-gold">Offline</span>
            </>
          )}
        </div>

        <div className="flex gap-1.5">
          <button className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink">
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
          </button>
          <button className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink">
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
