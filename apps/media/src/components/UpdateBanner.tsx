import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useUpdateStore } from "../lib/updates";

/** A thin bar under the menu when a new version has downloaded. You choose when to restart (never mid-service). */
export function UpdateBanner() {
  const { phase, version, dismissed, install, dismiss, error } = useUpdateStore();
  if (dismissed) return null;
  if (phase !== "ready" && phase !== "installing" && !(phase === "error" && version)) return null;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-primary/30 bg-primary-soft px-4 py-1.5">
      <Download className="size-4 text-primary-bright" />
      <span className="flex-1 text-[13px] text-ink">
        {phase === "error"
          ? <>The update to version {version} didn't install: {error}</>
          : <><b>WorshipHQ Live {version}</b> is ready. Restart when you're not in a service; your songs and settings stay.</>}
      </span>
      <button onClick={install} disabled={phase === "installing"}
        className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
        {phase === "installing" ? <Loader2 className="size-3.5 whq-spin" /> : <RefreshCw className="size-3.5" />}
        {phase === "installing" ? "Updating…" : "Restart and update"}
      </button>
      <button onClick={dismiss} className="rounded p-1 text-ink-faint hover:bg-surface-4 hover:text-ink" title="Later (it stays ready in Help › Check for updates)"><X className="size-4" /></button>
    </div>
  );
}
