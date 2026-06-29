import { useEffect, useState } from "react";
import {
  Save, Loader2, Database, RefreshCw, Trash2, User, Church, HardDrive,
  ExternalLink, Users2, Layers, Shield, Plus, X, Check, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { useAppStore } from "../stores/app-store";
import { db, sync, auth, appInfo } from "../lib/api";

type Tab = "profile" | "church" | "team" | "departments" | "sync" | "about";

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
    { key: "team", label: "Team", icon: Users2 },
    { key: "departments", label: "Departments", icon: Layers },
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
          {tab === "team" && <TeamTab />}
          {tab === "departments" && <DepartmentsTab />}
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
  const { session, showToast } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session?.userName || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const userId = session?.userId;
      if (userId) {
        await db.update("user", userId, { name: name.trim() });
        showToast("Profile updated! Changes will sync.");
      }
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">My Profile</h2>
        <p className="text-sm text-ink-muted">Your account details synced from WorshipHQ.</p>
      </div>

      <div className="card space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar name={session?.userName || "User"} src={session?.userPhotoUrl} size="xl" />
            <button
              onClick={() => window.api?.openExternal("https://worshiphq.app/app/settings")}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Change photo on web"
            >
              <Pencil className="size-4 text-white" />
            </button>
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input max-w-xs"
                  autoFocus
                />
                <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
                  {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
                  Save
                </button>
                <button onClick={() => { setEditing(false); setName(session?.userName || ""); }} className="btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-ink">{session?.userName}</p>
                  <button onClick={() => setEditing(true)} className="grid size-6 place-items-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-ink">
                    <Pencil className="size-3" />
                  </button>
                </div>
                <p className="text-sm text-ink-muted">{session?.userEmail}</p>
                <span className="mt-1 inline-block badge badge-primary capitalize">
                  {session?.userRole}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <p className="text-xs text-ink-faint">Church</p>
            <p className="text-sm font-medium text-ink">{session?.churchName}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Server</p>
            <p className="text-sm font-medium text-ink">{session?.serverUrl}</p>
          </div>
        </div>

        <p className="text-xs text-ink-faint flex items-center gap-1.5">
          <ExternalLink className="size-3" />
          To update your photo or password,{" "}
          <button onClick={() => window.api?.openExternal("https://worshiphq.app/app/settings")} className="text-primary-bright hover:underline">
            use the web app
          </button>.
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

  if (!church) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 text-primary-bright whq-spin" />
      </div>
    );
  }

  const fields = [
    { label: "Church Name", value: church.name },
    { label: "Denomination", value: church.denomination },
    { label: "City", value: church.city },
    { label: "Country", value: church.country },
    { label: "Address", value: church.address },
    { label: "Member Prefix", value: church.member_prefix },
    { label: "Accent Color", value: church.accent_color, color: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Church Information</h2>
        <p className="text-sm text-ink-muted">Details synced from your WorshipHQ account.</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-5">
          {church.logo_url ? (
            <img src={church.logo_url} alt="" className="size-14 rounded-xl object-cover" />
          ) : (
            <div className="grid size-14 place-items-center rounded-xl bg-primary-soft">
              <Church className="size-7 text-primary-bright" />
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
              {f.color ? (
                <div className="flex items-center gap-2">
                  <div className="size-4 rounded" style={{ background: f.value || "#6D5EF8" }} />
                  <p className="text-sm font-mono text-ink-muted">{f.value || "#6D5EF8"}</p>
                </div>
              ) : (
                <p className="text-sm font-medium text-ink">{f.value || "—"}</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-faint flex items-center gap-1.5">
          <ExternalLink className="size-3" />
          To edit church settings,{" "}
          <button onClick={() => window.api?.openExternal("https://worshiphq.app/app/settings")} className="text-primary-bright hover:underline">
            use the web app
          </button>.
        </p>
      </div>
    </div>
  );
}

function TeamTab() {
  const { session } = useAppStore();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [u, r] = await Promise.all([
        db.query("user"),
        db.query("custom_role"),
      ]);
      setUsers(u);
      setRoles(r);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 text-primary-bright whq-spin" />
      </div>
    );
  }

  const builtInRoles = ["Owner", "Admin", "Pastor", "Finance", "Media", "Leader", "Volunteer"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Team Members</h2>
          <p className="text-sm text-ink-muted">{users.length} team member{users.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => window.api?.openExternal("https://worshiphq.app/app/settings")}
          className="btn-secondary btn-sm"
        >
          <ExternalLink className="size-3.5" />
          Manage on web
        </button>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card flex items-center gap-4 !p-4">
            <Avatar name={u.name} src={u.photo_url} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink truncate">{u.name}</p>
                {u.id === session?.userId && (
                  <span className="badge badge-primary">You</span>
                )}
              </div>
              <p className="text-xs text-ink-muted truncate">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="size-3.5 text-ink-faint" />
              <span className="text-xs font-medium text-ink-muted capitalize">{u.role}</span>
            </div>
          </div>
        ))}
      </div>

      {roles.length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-sm font-bold text-ink">Custom Roles</h3>
          <div className="space-y-2">
            {roles.map((r: any) => {
              let sections: string[] = [];
              try { sections = JSON.parse(r.sections || "[]"); } catch {}
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <p className="text-sm font-medium text-ink">{r.name}</p>
                  <p className="text-xs text-ink-faint">{sections.length} permission{sections.length !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DepartmentsTab() {
  const { showToast } = useAppStore();
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadDepartments();
  }, []);

  async function loadDepartments() {
    const depts = await db.query("department");
    setDepartments(depts);
    setLoading(false);

    const counts: Record<string, number> = {};
    for (const d of depts) {
      const members = await db.rawQuery(
        `SELECT COUNT(*) as cnt FROM person_department WHERE department_id = ?`,
        [d.id]
      );
      counts[d.id] = (members as any)?.[0]?.cnt || 0;
    }
    setMemberCounts(counts);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const session = useAppStore.getState().session;
      await db.insert("department", {
        church_id: session?.churchId,
        name: newName.trim(),
      });
      showToast("Department added!");
      setNewName("");
      setAdding(false);
      loadDepartments();
    } catch {
      showToast("Failed to add department", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Members won't be removed.`)) return;
    try {
      await db.delete("department", id);
      showToast("Department deleted");
      loadDepartments();
    } catch {
      showToast("Failed to delete", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 text-primary-bright whq-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Departments</h2>
          <p className="text-sm text-ink-muted">{departments.length} department{departments.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" />
          Add Department
        </button>
      </div>

      {adding && (
        <div className="card flex items-center gap-3 !p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input flex-1"
            placeholder="Department name..."
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button onClick={handleAdd} disabled={saving} className="btn-primary btn-sm">
            {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
            Add
          </button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="btn-ghost btn-sm">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {departments.map((d) => (
          <div key={d.id} className="card flex items-center justify-between !p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary-soft">
                <Layers className="size-4 text-primary-bright" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{d.name}</p>
                <p className="text-xs text-ink-faint">
                  {memberCounts[d.id] ?? 0} member{(memberCounts[d.id] ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(d.id, d.name)}
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger transition-all"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="card text-center py-10">
            <Layers className="size-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No departments yet</p>
            <p className="text-xs text-ink-faint mt-1">Add departments to organize your team, or sync to pull from web.</p>
          </div>
        )}
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
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadCounts() {
      const tables = ["person", "gift", "attendance_session", "event", "department", "user"];
      const c: Record<string, number> = {};
      for (const t of tables) {
        try {
          const rows = await db.rawQuery(`SELECT COUNT(*) as cnt FROM "${t}"`);
          c[t] = (rows as any)?.[0]?.cnt || 0;
        } catch { c[t] = 0; }
      }
      setCounts(c);
    }
    loadCounts();
  }, [syncStatus.lastSyncAt]);

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

      {Object.keys(counts).length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-sm font-bold text-ink">Local Data</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "person", label: "Members" },
              { key: "gift", label: "Gifts" },
              { key: "attendance_session", label: "Services" },
              { key: "event", label: "Events" },
              { key: "department", label: "Departments" },
              { key: "user", label: "Team" },
            ].map((t) => (
              <div key={t.key} className="rounded-lg border border-line p-3 text-center">
                <p className="text-lg font-bold text-ink">{counts[t.key] ?? 0}</p>
                <p className="text-[10px] text-ink-faint">{t.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div>
            <p className="text-xs text-ink-faint">Engine</p>
            <p className="text-sm font-medium text-ink">Electron + SQLite</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Sync</p>
            <p className="text-sm font-medium text-ink">Bi-directional</p>
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
