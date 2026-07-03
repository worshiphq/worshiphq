import { useState, useEffect } from "react";
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
  const [syncPhase, setSyncPhase] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function checkOnline() {
      try {
        const s = useAppStore.getState().session;
        const url = s?.serverUrl || "https://worshiphq.app";
        const r = await fetch(`${url}/api/health`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        if (mounted) setOnline(r.ok);
      } catch {
        if (mounted) setOnline(false);
      }
    }
    checkOnline();
    const interval = setInterval(checkOnline, 30000);
    const onOnline = () => { checkOnline(); };
    const onOffline = () => { checkOnline(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const unsub = sync.onProgress((p) => {
      setSyncPhase(p.phase);
      if (p.phase === "done" || p.phase === "error") {
        setSyncing(false);
        setSyncPhase(null);
        sync.status().then(setSyncStatus);
      } else {
        setSyncing(true);
      }
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsub();
    };
  }, []);

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
    <header className="flex h-16 items-center justify-between border-b border-line bg-base/80 backdrop-blur-xl px-5">
      <h1 className="text-sm font-bold text-ink">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Sync status */}
        <div className="flex items-center gap-1.5">
          {syncing && syncPhase && (
            <span className="flex items-center gap-1.5 badge badge-primary">
              <Loader2 className="size-3 whq-spin" />
              {syncPhase === "pushing" ? "Pushing..." : syncPhase === "pulling" ? "Syncing..." : "Starting..."}
            </span>
          )}

          {!syncing && syncStatus.pendingChanges > 0 && (
            <span className="badge badge-gold">
              {syncStatus.pendingChanges} pending
            </span>
          )}

          {!syncing && syncStatus.lastSyncAt && (
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
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg animate-fade-up">
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
