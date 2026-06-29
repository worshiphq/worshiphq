import { useState } from "react";
import {
  RefreshCw, Wifi, WifiOff, Cloud, CloudOff, LogOut,
  Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { sync, auth } from "../lib/api";
import { timeAgo } from "../lib/utils";

export function Topbar({ title }: { title: string }) {
  const { session, syncStatus, setSyncStatus, setSession } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));

  async function handleSync() {
    setSyncing(true);
    const result = await sync.now();
    setSyncStatus(result);
    setSyncing(false);
  }

  async function handleLogout() {
    await auth.logout();
    setSession(null);
  }

  return (
    <header className="flex h-12 items-center justify-between border-b border-line bg-surface px-5">
      <h1 className="text-sm font-bold text-ink">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Sync status */}
        <div className="flex items-center gap-1.5">
          {syncStatus.pendingChanges > 0 && (
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
              {syncStatus.pendingChanges} pending
            </span>
          )}

          {syncStatus.lastSyncAt && (
            <span className="text-[10px] text-ink-faint">
              Synced {timeAgo(syncStatus.lastSyncAt)}
            </span>
          )}
        </div>

        {/* Connection indicator */}
        {online ? (
          <Cloud className="size-3.5 text-success" />
        ) : (
          <CloudOff className="size-3.5 text-ink-faint" />
        )}

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing || !online}
          className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40"
          title="Sync now"
        >
          {syncing ? (
            <Loader2 className="size-4 whq-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </button>

        {/* User menu */}
        <div className="flex items-center gap-2 border-l border-line pl-3">
          <div className="text-right">
            <p className="text-[11px] font-medium text-ink">{session?.userName}</p>
            <p className="text-[9px] text-ink-faint">{session?.userRole}</p>
          </div>
          <button
            onClick={handleLogout}
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
            title="Logout"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
