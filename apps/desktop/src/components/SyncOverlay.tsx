import { useEffect } from "react";
import {
  RefreshCw, CheckCircle2, XCircle, CloudUpload, CloudDownload,
  Loader2, Database,
} from "lucide-react";
import { sync } from "../lib/api";
import { useAppStore } from "../stores/app-store";

const PHASE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  starting: { icon: RefreshCw, label: "Preparing sync...", color: "text-primary-bright" },
  pushing: { icon: CloudUpload, label: "Uploading changes...", color: "text-info" },
  pulling: { icon: CloudDownload, label: "Downloading data...", color: "text-sky" },
  applying: { icon: Database, label: "Applying changes...", color: "text-gold" },
  done: { icon: CheckCircle2, label: "Sync complete!", color: "text-success" },
  error: { icon: XCircle, label: "Sync failed", color: "text-danger" },
};

export function SyncOverlay() {
  const { syncOverlay, updateSyncOverlay, setSyncStatus, bumpSyncVersion } = useAppStore();

  useEffect(() => {
    const unsub = sync.onProgress((p) => {
      if (p.phase === "starting") {
        updateSyncOverlay({
          visible: true,
          phase: "starting",
          progress: 5,
          message: "Preparing sync...",
          detail: "",
          pushed: 0,
          pulled: 0,
          skipped: 0,
          error: null,
          tables: [],
          currentTable: "",
        });
      } else if (p.phase === "pushing") {
        updateSyncOverlay({
          phase: "pushing",
          progress: p.progress || 15,
          message: p.count != null
            ? `Uploading ${p.count} change${p.count !== 1 ? "s" : ""}...`
            : "Uploading local changes...",
          detail: p.detail || "",
          pushed: p.count || 0,
        });
      } else if (p.phase === "pulling") {
        updateSyncOverlay({
          phase: "pulling",
          progress: p.progress || 40,
          message: p.detail
            ? `Downloading: ${p.detail}`
            : "Downloading from server...",
          detail: p.detail || "",
          currentTable: p.currentTable || "",
        });
      } else if (p.phase === "applying") {
        updateSyncOverlay({
          phase: "applying",
          progress: p.progress || 80,
          message: p.detail || "Applying changes to local database...",
          detail: p.detail || "",
          pulled: p.count || 0,
          skipped: p.skipped || 0,
        });
      } else if (p.phase === "done") {
        updateSyncOverlay({
          phase: "done",
          progress: 100,
          message: "Sync complete!",
          pulled: p.pulled || 0,
          pushed: p.pushed || 0,
          skipped: p.skipped || 0,
          detail: buildSummary(p.pushed || 0, p.pulled || 0, p.skipped || 0),
        });
        sync.status().then(setSyncStatus);
        bumpSyncVersion();
      } else if (p.phase === "error") {
        updateSyncOverlay({
          phase: "error",
          progress: 0,
          message: "Sync failed",
          error: p.error || "Unknown error",
          detail: p.error || "",
        });
        sync.status().then(setSyncStatus);
      }
    });

    return unsub;
  }, []);

  if (!syncOverlay.visible) return null;

  const config = PHASE_CONFIG[syncOverlay.phase] || PHASE_CONFIG.starting;
  const Icon = config.icon;
  const isActive = syncOverlay.phase !== "done" && syncOverlay.phase !== "error";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-line">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`rounded-2xl p-4 ${syncOverlay.phase === "done" ? "bg-success/10" : syncOverlay.phase === "error" ? "bg-danger/10" : "bg-primary-soft"}`}>
            <Icon className={`size-8 ${config.color} ${isActive ? "whq-spin" : ""}`} />
          </div>
        </div>

        {/* Title */}
        <h3 className={`text-center text-lg font-bold ${config.color}`}>
          {config.label}
        </h3>

        {/* Message */}
        <p className="mt-1 text-center text-sm text-ink-muted">
          {syncOverlay.message}
        </p>

        {/* Progress bar */}
        {isActive && (
          <div className="mt-4 h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-bright transition-all duration-500 ease-out"
              style={{ width: `${syncOverlay.progress}%` }}
            />
          </div>
        )}

        {/* Progress percentage */}
        {isActive && (
          <p className="mt-1.5 text-center text-xs text-ink-faint">
            {Math.round(syncOverlay.progress)}%
          </p>
        )}

        {/* Summary stats on completion */}
        {syncOverlay.phase === "done" && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-info/10 px-3 py-2 text-center">
              <p className="text-lg font-bold text-info">{syncOverlay.pushed}</p>
              <p className="text-[10px] font-medium text-info/70 uppercase tracking-wider">Pushed</p>
            </div>
            <div className="rounded-xl bg-success/10 px-3 py-2 text-center">
              <p className="text-lg font-bold text-success">{syncOverlay.pulled}</p>
              <p className="text-[10px] font-medium text-success/70 uppercase tracking-wider">Pulled</p>
            </div>
            <div className="rounded-xl bg-ink-faint/10 px-3 py-2 text-center">
              <p className="text-lg font-bold text-ink-muted">{syncOverlay.skipped}</p>
              <p className="text-[10px] font-medium text-ink-faint uppercase tracking-wider">Skipped</p>
            </div>
          </div>
        )}

        {/* Error detail */}
        {syncOverlay.phase === "error" && syncOverlay.error && (
          <div className="mt-4 rounded-xl bg-danger/10 px-4 py-3">
            <p className="text-xs text-danger">{syncOverlay.error}</p>
          </div>
        )}

        {/* Dismiss button for done/error */}
        {!isActive && (
          <button
            onClick={() => updateSyncOverlay({ visible: false })}
            className="mt-4 w-full rounded-xl bg-surface-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-3/80 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function buildSummary(pushed: number, pulled: number, skipped: number): string {
  const parts: string[] = [];
  if (pushed > 0) parts.push(`${pushed} pushed`);
  if (pulled > 0) parts.push(`${pulled} pulled`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts.length ? parts.join(", ") : "Everything up to date";
}
