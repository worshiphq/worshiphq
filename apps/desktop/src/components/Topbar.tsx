import { useState } from "react";
import {
  RefreshCw, Cloud, CloudOff, LogOut,
  Loader2, Settings, User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/app-store";
import { Avatar } from "./ui/Avatar";
import { sync, auth } from "../lib/api";
import { timeAgo } from "../lib/utils";

export function Topbar({ title }: { title: string }) {
  const { session, syncStatus, setSyncStatus, setSession } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

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
            <span className="badge badge-gold">
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

        {/* Profile dropdown */}
        <div className="relative border-l border-line pl-3">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-3"
          >
            <Avatar name={session?.userName || "User"} src={session?.userPhotoUrl} size="xs" />
            <div className="text-left">
              <p className="text-[11px] font-medium text-ink leading-tight">{session?.userName}</p>
              <p className="text-[9px] text-ink-faint capitalize">{session?.userRole}</p>
            </div>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg">
                <div className="px-3 py-2 border-b border-line mb-1">
                  <p className="text-xs font-medium text-ink">{session?.userName}</p>
                  <p className="text-[10px] text-ink-faint">{session?.userEmail}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/settings"); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
                >
                  <Settings className="size-3.5" />
                  Settings
                </button>
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-danger hover:bg-danger/10"
                >
                  <LogOut className="size-3.5" />
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
