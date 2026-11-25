import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useUpdateStore } from "../lib/updates";

/** A thin bar under the menu: a new version is there (press Download), or it is downloaded (press Restart). Never mid-service. */
export function UpdateBanner() {
  const { phase, version, dismissed, install, download, dismiss, error, progress } = useUpdateStore();
  if (dismissed) return null;
  if (phase !== "available" && phase !== "downloading" && phase !== "ready" && phase !== "installing" && !(phase === "error" && version)) return null;
  const busy = phase === "installing" || phase === "downloading";
  const ready = phase === "ready" || phase === "installing";
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-primary/30 bg-primary-soft px-4 py-1.5">
      <Download className="size-4 text-primary-bright" />
      <span className="flex-1 text-[13px] text-ink">
        {phase === "error" ? <>The update to version {version} didn't install: {error}</>
          : phase === "downloading" ? <>Downloading <b>WorshipHQ Live {version}</b>… {progress}%</>
          : ready ? <><b>WorshipHQ Live {version}</b> is downloaded. Restart when you're not in a service; your songs and settings stay.</>
          : <><b>WorshipHQ Live {version}</b> is available.{error ? ` The last download didn't finish (${error}).` : ""}</>}
      </span>
      {phase !== "error" && (
        <button onClick={ready ? install : download} disabled={busy}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
          {busy ? <Loader2 className="size-3.5 whq-spin" /> : ready ? <RefreshCw className="size-3.5" /> : <Download className="size-3.5" />}
          {phase === "installing" ? "Updating…" : phase === "downloading" ? "Downloading…" : ready ? "Restart and update" : "Download"}
        </button>
      )}
      <button onClick={dismiss} className="rounded p-1 text-ink-faint hover:bg-surface-4 hover:text-ink" title="Later (it stays in Settings › About)"><X className="size-4" /></button>
    </div>
  );
}
