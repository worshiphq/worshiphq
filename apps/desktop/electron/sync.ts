import { ipcMain, BrowserWindow } from "electron";
import { getDatabase } from "./database";

const SYNC_TABLES = [
  "church",
  "branch",
  "user",
  "department",
  "person",
  "person_department",
  "department_position",
  "household",
  "group",
  "group_member",
  "attendance_session",
  "attendance_record",
  "fund",
  "gift",
  "transaction",
  "expense",
  "event",
  "visitor",
  "harvest",
  "harvest_contribution",
  "day_born_week",
  "day_born_entry",
  "follow_up",
  "prayer_request",
  "church_notice",
  "sermon",
  "asset",
  "budget",
  "budget_item",
  "volunteer_roster",
  "volunteer_slot",
  "facility",
  "booking",
  "custom_role",
  "welfare_record",
  "devotional",
  "testimony",
  "counseling_session",
  "pledge",
  "campaign",
  "communication",
  "automation",
  "audit_log",
];

interface SyncStatus {
  lastSyncAt: string | null;
  pendingChanges: number;
  syncing: boolean;
  error: string | null;
}

let syncing = false;

function getSyncMeta(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM _sync_meta WHERE key = ?").get(key) as any;
  return row?.value ?? null;
}

function setSyncMeta(key: string, value: string) {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO _sync_meta (key, value) VALUES (?, ?)").run(key, value);
}

function getPendingCount(): number {
  const db = getDatabase();
  const row = db.prepare("SELECT COUNT(*) as cnt FROM _change_log WHERE synced = 0").get() as any;
  return row?.cnt ?? 0;
}

function broadcast(event: string, data: any) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(event, data);
  });
}

export function registerSyncHandlers() {
  ipcMain.handle("sync:status", (): SyncStatus => {
    return {
      lastSyncAt: getSyncMeta("last_sync_at"),
      pendingChanges: getPendingCount(),
      syncing,
      error: null,
    };
  });

  ipcMain.handle("sync:now", async (): Promise<SyncStatus> => {
    if (syncing) {
      return {
        lastSyncAt: getSyncMeta("last_sync_at"),
        pendingChanges: getPendingCount(),
        syncing: true,
        error: "Sync already in progress",
      };
    }

    syncing = true;
    broadcast("sync:progress", { phase: "starting", progress: 0 });

    try {
      const serverUrl = getSyncMeta("server_url");
      const token = getSyncMeta("auth_token");

      if (!serverUrl || !token) {
        throw new Error("Not logged in — connect to your WorshipHQ account first");
      }

      // ── Phase 1: Push local changes ──
      broadcast("sync:progress", { phase: "pushing", progress: 10 });
      await pushChanges(serverUrl, token);

      // ── Phase 2: Pull remote changes ──
      broadcast("sync:progress", { phase: "pulling", progress: 50 });
      await pullChanges(serverUrl, token);

      const now = new Date().toISOString();
      setSyncMeta("last_sync_at", now);

      broadcast("sync:progress", { phase: "done", progress: 100 });

      return {
        lastSyncAt: now,
        pendingChanges: 0,
        syncing: false,
        error: null,
      };
    } catch (err: any) {
      const error = err?.message || "Sync failed";
      broadcast("sync:progress", { phase: "error", progress: 0, error });
      return {
        lastSyncAt: getSyncMeta("last_sync_at"),
        pendingChanges: getPendingCount(),
        syncing: false,
        error,
      };
    } finally {
      syncing = false;
    }
  });

  ipcMain.handle("auth:login", async (_e, serverUrl: string, email: string, password: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/desktop/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Login failed (${res.status})`);
      }

      const data = await res.json();

      setSyncMeta("server_url", serverUrl);
      setSyncMeta("auth_token", data.token);
      setSyncMeta("user_id", data.user.id);
      setSyncMeta("church_id", data.user.churchId);
      setSyncMeta("user_name", data.user.name);
      setSyncMeta("user_email", data.user.email);
      setSyncMeta("user_role", data.user.role);
      setSyncMeta("church_name", data.church.name);

      // Upsert church + user locally
      const db = getDatabase();
      db.prepare(`INSERT OR REPLACE INTO church (id, slug, name, denomination, city, country, address, accent_color, logo_url, member_prefix, member_seq)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        data.church.id, data.church.slug, data.church.name,
        data.church.denomination, data.church.city, data.church.country,
        data.church.address, data.church.accentColor, data.church.logoUrl,
        data.church.memberPrefix, data.church.memberSeq
      );

      db.prepare(`INSERT OR REPLACE INTO user (id, church_id, email, name, role, phone, photo_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        data.user.id, data.user.churchId, data.user.email,
        data.user.name, data.user.role, data.user.phone, data.user.photoUrl
      );

      return { success: true, user: data.user, church: data.church };
    } catch (err: any) {
      return { success: false, error: err?.message || "Connection failed" };
    }
  });

  ipcMain.handle("auth:getSession", () => {
    const token = getSyncMeta("auth_token");
    if (!token) return null;

    return {
      userId: getSyncMeta("user_id"),
      churchId: getSyncMeta("church_id"),
      userName: getSyncMeta("user_name"),
      userEmail: getSyncMeta("user_email"),
      userRole: getSyncMeta("user_role"),
      churchName: getSyncMeta("church_name"),
      serverUrl: getSyncMeta("server_url"),
      lastSyncAt: getSyncMeta("last_sync_at"),
    };
  });

  ipcMain.handle("auth:logout", () => {
    const db = getDatabase();
    db.prepare("DELETE FROM _sync_meta WHERE key IN ('auth_token', 'user_id', 'church_id', 'user_name', 'user_email', 'user_role', 'church_name')").run();
    return { success: true };
  });

  // Auto-sync every 5 minutes when logged in
  setInterval(async () => {
    const token = getSyncMeta("auth_token");
    if (token && !syncing && getPendingCount() > 0) {
      try {
        const serverUrl = getSyncMeta("server_url")!;
        await pushChanges(serverUrl, token);
      } catch {
        // Silent fail for background sync
      }
    }
  }, 5 * 60 * 1000);
}

async function pushChanges(serverUrl: string, token: string) {
  const db = getDatabase();
  const changes = db.prepare("SELECT * FROM _change_log WHERE synced = 0 ORDER BY id ASC LIMIT 500").all() as any[];

  if (changes.length === 0) return;

  const payload = changes.map((c) => ({
    table: c.table_name,
    recordId: c.record_id,
    action: c.action,
    data: c.data ? JSON.parse(c.data) : null,
    timestamp: c.created_at,
  }));

  const res = await fetch(`${serverUrl}/api/desktop/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ changes: payload }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Push failed (${res.status})`);
  }

  // Mark as synced
  const ids = changes.map((c) => c.id);
  db.prepare(`UPDATE _change_log SET synced = 1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
}

async function pullChanges(serverUrl: string, token: string) {
  const lastSync = getSyncMeta("last_sync_at") || "1970-01-01T00:00:00Z";

  const res = await fetch(`${serverUrl}/api/desktop/sync/pull?since=${encodeURIComponent(lastSync)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Pull failed (${res.status})`);
  }

  const { changes } = await res.json();
  const db = getDatabase();

  const applyChanges = db.transaction(() => {
    for (const change of changes) {
      const { table, recordId, action, data } = change;

      if (action === "delete") {
        db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(recordId);
      } else if (action === "insert" || action === "upsert") {
        const cols = Object.keys(data);
        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map((c: string) => data[c]);
        db.prepare(
          `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
        ).run(...values);
      }
    }
  });

  applyChanges();
  broadcast("sync:progress", { phase: "pulling", progress: 90, count: changes.length });
}
