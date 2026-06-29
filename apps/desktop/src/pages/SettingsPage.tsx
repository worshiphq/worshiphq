import { useEffect, useState } from "react";
import { Save, Loader2, Database, RefreshCw, Trash2, User, Church, HardDrive, ExternalLink } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { useAppStore } from "../stores/app-store";
import { db, sync, auth, appInfo } from "../lib/api";

type Tab = "profile" | "church" | "sync" | "about";

export function SettingsPage() {
  const { session, syncStatus, setSyncStatus, setSession, showToast } = useAppStore();
  const [tab, setTab] = useState<Tab>("profile");
  const [syncing, setSyncing] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [dataPath, setDataPath] = useState("");

  useEffect(() => {
    appInfo.version().then(setVersion);
    appInfo.dataPath().then(setDataPath);
  }, []);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "profile", label: "My Profile", icon: User },
    { key: "church", label: "Church Info", icon: Church },
    { key: "sync", label: "Sync & Data", icon: RefreshCw },
    { key: "about", label: "About", icon: HardDrive },
  ];

  async function handleSync() {
    setSyncing(true);
    const result = await sync.now();
    setSyncStatus(result);
    setSyncing(false);
    showToast("Sync complete!");
  }

  async function handleClearData() {
    if (!confirm("This will clear all local data and log you out. You'll need to log in and sync again. Continue?")) return;
    await auth.logout();
    setSession(null);
    showToast("Local data cleared", "info");
  }

  function handleOpenWebsite() {
    window.api?.openExternal("https://worshiphq.app/app/settings");
  }

  return (
    <PageShell title="Settings">
      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-48 shrink-0">
          <div className="space-y-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-primary-soft text-primary-bright"
                    : "text-ink-muted hover:bg-surface-3 hover:text-ink"
                }`}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <button
              onClick={handleOpenWebsite}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              <ExternalLink className="size-3.5" />
              Open web settings
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {tab === "profile" && <ProfileTab />}
          {tab === "church" && <ChurchTab />}
          {tab === "sync" && (
            <SyncTab
              syncStatus={syncStatus}
              syncing={syncing}
              onSync={handleSync}
              onClear={handleClearData}
              dataPath={dataPath}
            />
          )}
          {tab === "about" && <AboutTab version={version} />}
        </div>
      </div>
    </PageShell>
  );
}

function ProfileTab() {
  const { session } = useAppStore();

  const initials = session?.userName
    ? session.userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">My Profile</h2>
        <p className="text-sm text-ink-muted">Your account details synced from WorshipHQ.</p>
      </div>

      <div className="card space-y-5">
        <div className="flex items-center gap-4">
          {session?.userPhotoUrl ? (
            <img src={session.userPhotoUrl} alt="" className="size-16 rounded-2xl object-cover" />
          ) : (
            <div className="grid size-16 place-items-center rounded-2xl bg-primary-soft text-xl font-bold text-primary-bright">
              {initials}
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-ink">{session?.userName}</p>
            <p className="text-sm text-ink-muted">{session?.userEmail}</p>
            <span className="mt-1 inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-bright capitalize">
              {session?.userRole}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <p className="text-xs text-ink-faint">Church</p>
            <p className="text-sm font-medium text-ink">{session?.churchName}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Church ID</p>
            <p className="text-sm font-mono text-ink-muted">{session?.churchId?.slice(0, 8)}...</p>
          </div>
        </div>

        <p className="text-xs text-ink-faint">
          To update your profile photo or password, use the web app.
        </p>
      </div>
    </div>
  );
}

function ChurchTab() {
  const { session } = useAppStore();
  const [church, setChurch] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) {
      db.getById("church", session.churchId).then(setChurch);
    }
  }, [session?.churchId]);

  if (!church) return null;

  const fields = [
    { label: "Church Name", value: church.name },
    { label: "Denomination", value: church.denomination },
    { label: "City", value: church.city },
    { label: "Country", value: church.country },
    { label: "Address", value: church.address },
    { label: "Member Prefix", value: church.member_prefix },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Church Information</h2>
        <p className="text-sm text-ink-muted">Details synced from your WorshipHQ account.</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-5">
          {session?.churchLogoUrl ? (
            <img src={session.churchLogoUrl} alt="" className="size-14 rounded-xl object-cover" />
          ) : (
            <div className="grid size-14 place-items-center rounded-xl bg-primary-soft">
              <img src="/icon.png" alt="" className="size-8 object-contain" />
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-ink">{church.name}</p>
            <p className="text-sm text-ink-muted">{church.denomination || "Church"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-xs text-ink-faint">{f.label}</p>
              <p className="text-sm font-medium text-ink">{f.value || "—"}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-faint">
          To edit church settings, use the web app.
        </p>
      </div>
    </div>
  );
}

function SyncTab({
  syncStatus,
  syncing,
  onSync,
  onClear,
  dataPath,
}: {
  syncStatus: any;
  syncing: boolean;
  onSync: () => void;
  onClear: () => void;
  dataPath: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Sync & Data</h2>
        <p className="text-sm text-ink-muted">Manage synchronization and local data storage.</p>
      </div>

      <div className="card space-y-4">
        <h3 className="text-sm font-bold text-ink">Sync Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-faint">Last Synced</p>
            <p className="text-sm font-medium text-ink">
              {syncStatus.lastSyncAt
                ? new Date(syncStatus.lastSyncAt).toLocaleString()
                : "Never"}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Pending Changes</p>
            <p className="text-sm font-medium text-ink">{syncStatus.pendingChanges}</p>
          </div>
        </div>

        <button
          onClick={onSync}
          disabled={syncing}
          className="btn-primary py-2 px-4 text-sm"
        >
          {syncing ? <Loader2 className="size-4 whq-spin" /> : <RefreshCw className="size-4" />}
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-bold text-ink">Local Storage</h3>
        <div>
          <p className="text-xs text-ink-faint">Data Location</p>
          <p className="text-sm font-mono text-ink-muted break-all">{dataPath}</p>
        </div>
        <p className="text-xs text-ink-faint">
          All your data is stored locally on this computer and syncs with the cloud when online.
        </p>
      </div>

      <div className="card border-danger/20">
        <h3 className="text-sm font-bold text-danger">Danger Zone</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Clear all local data and reset the app. You will need to log in and sync again.
        </p>
        <button onClick={onClear} className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">
          <Trash2 className="size-3.5" />
          Clear Data & Log Out
        </button>
      </div>
    </div>
  );
}

function AboutTab({ version }: { version: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">About WorshipHQ Desktop</h2>
        <p className="text-sm text-ink-muted">Offline-first church management.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <img src="/icon.png" alt="" className="size-14 object-contain" />
          <div>
            <p className="text-lg font-bold text-ink">WorshipHQ</p>
            <p className="text-sm text-ink-muted">Church Management System</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <p className="text-xs text-ink-faint">Version</p>
            <p className="text-sm font-medium text-ink">v{version}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Platform</p>
            <p className="text-sm font-medium text-ink">Windows Desktop</p>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-xs text-ink-faint">
            WorshipHQ Desktop works fully offline and syncs with your cloud account when connected. All data is stored securely on your local machine.
          </p>
        </div>

        <button
          onClick={() => window.api?.openExternal("https://worshiphq.app")}
          className="flex items-center gap-2 text-sm text-primary-bright hover:underline"
        >
          <ExternalLink className="size-3.5" />
          Visit worshiphq.app
        </button>
      </div>
    </div>
  );
}
