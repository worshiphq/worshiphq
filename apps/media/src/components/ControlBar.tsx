import { Play, MonitorOff, ImageIcon, X, Timer, AlertTriangle } from "lucide-react";

export function ControlBar({
  isLive,
  isBlack,
  onGoLive,
  onGoBlack,
  onGoLogo,
  onGoClear,
}: {
  isLive: boolean;
  isBlack: boolean;
  onGoLive: () => void;
  onGoBlack: () => void;
  onGoLogo: () => void;
  onGoClear: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
      <button
        onClick={onGoLive}
        className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
          isLive
            ? "bg-danger text-white shadow-lg shadow-danger/30"
            : "bg-primary text-white hover:bg-primary-bright"
        }`}
      >
        <Play className="size-3.5" />
        {isLive ? "LIVE" : "Go Live"}
      </button>

      <button
        onClick={onGoBlack}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          isBlack
            ? "bg-ink text-surface"
            : "bg-surface-3 text-ink-muted hover:bg-surface-4 hover:text-ink"
        }`}
      >
        <MonitorOff className="size-3.5" />
        Black
      </button>

      <button
        onClick={onGoLogo}
        className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-4 hover:text-ink"
      >
        <ImageIcon className="size-3.5" />
        Logo
      </button>

      <button
        onClick={onGoClear}
        className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-4 hover:text-ink"
      >
        <X className="size-3.5" />
        Clear
      </button>

      <div className="mx-2 h-5 w-px bg-line" />

      <button className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-4 hover:text-ink">
        <Timer className="size-3.5" />
        Timer
      </button>

      <button className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-4 hover:text-ink">
        <AlertTriangle className="size-3.5" />
        Alert
      </button>
    </div>
  );
}
