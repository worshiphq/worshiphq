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
  "church_account",
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
  "volunteer_assignment",
  "reminder",
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
      const pendingCount = getPendingCount();
      broadcast("sync:progress", { phase: "pushing", progress: 10, count: pendingCount, detail: `${pendingCount} local change${pendingCount !== 1 ? "s" : ""} to upload` });
      const pushedCount = await pushChanges(serverUrl, token);
      broadcast("sync:progress", { phase: "pushing", progress: 30, count: pushedCount, detail: pushedCount > 0 ? `Uploaded ${pushedCount} change${pushedCount !== 1 ? "s" : ""}` : "No local changes" });

      // ── Refresh plan status during sync ──
      try {
        const planRes = await fetch(`${serverUrl}/api/desktop/plan-check`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (planRes.ok) {
          const planData = await planRes.json();
          setSyncMeta("plan", planData.plan);
          setSyncMeta("plan_status", planData.status);
          setSyncMeta("plan_renews_at", planData.renewsAt || "");
          setSyncMeta("plan_signed_expiry", planData.signedExpiry || "");
          setSyncMeta("plan_checked_at", new Date().toISOString());
        }
      } catch {}

      // ── Phase 2: Pull remote changes ──
      broadcast("sync:progress", { phase: "pulling", progress: 35, detail: "Requesting data from server..." });
      const { applied: pulledCount, skipped: skippedCount } = await pullChanges(serverUrl, token);

      const now = new Date().toISOString();
      setSyncMeta("last_sync_at", now);

      broadcast("sync:progress", { phase: "done", progress: 100, pushed: pushedCount, pulled: pulledCount, skipped: skippedCount });

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
        const text = await res.text();
        let errorMsg = `Login failed (${res.status})`;
        try {
          const body = JSON.parse(text);
          errorMsg = body.error || errorMsg;
        } catch {
          if (res.status === 404) errorMsg = "Desktop login API not found. Make sure your WorshipHQ site is up to date.";
          else if (res.status >= 500) errorMsg = "Server error. Try again later.";
        }
        throw new Error(errorMsg);
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
      setSyncMeta("user_photo_url", data.user.photoUrl || "");
      setSyncMeta("church_logo_url", data.church.logoUrl || "");

      // Store subscription/plan info (server-signed to prevent tampering)
      if (data.subscription) {
        setSyncMeta("plan", data.subscription.plan);
        setSyncMeta("plan_status", data.subscription.status);
        setSyncMeta("plan_renews_at", data.subscription.renewsAt || "");
        setSyncMeta("plan_signed_expiry", data.subscription.signedExpiry || "");
        setSyncMeta("plan_checked_at", new Date().toISOString());
      }

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

      setTimeout(async () => {
        if (!syncing) {
          syncing = true;
          broadcast("sync:progress", { phase: "starting", progress: 0 });
          try {
            broadcast("sync:progress", { phase: "pulling", progress: 20, detail: "Initial sync — downloading all data..." });
            const { applied, skipped } = await pullChanges(serverUrl, data.token);
            const now = new Date().toISOString();
            setSyncMeta("last_sync_at", now);
            broadcast("sync:progress", { phase: "done", progress: 100, pushed: 0, pulled: applied, skipped });
          } catch (err: any) {
            broadcast("sync:progress", { phase: "error", progress: 0, error: err?.message || "Initial sync failed" });
          } finally {
            syncing = false;
          }
        }
      }, 500);

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
      userPhotoUrl: getSyncMeta("user_photo_url") || null,
      churchName: getSyncMeta("church_name"),
      churchLogoUrl: getSyncMeta("church_logo_url") || null,
      serverUrl: getSyncMeta("server_url"),
      lastSyncAt: getSyncMeta("last_sync_at"),
    };
  });

  ipcMain.handle("meta:set", (_e, key: string, value: string) => {
    const allowed = ["user_photo_url", "user_name"];
    if (!allowed.includes(key)) return;
    setSyncMeta(key, value);
  });

  // ── Plan check: returns locally stored plan info ──
  ipcMain.handle("plan:get", () => {
    return {
      plan: getSyncMeta("plan") || "free",
      status: getSyncMeta("plan_status") || "active",
      renewsAt: getSyncMeta("plan_renews_at") || null,
      signedExpiry: getSyncMeta("plan_signed_expiry") || null,
      checkedAt: getSyncMeta("plan_checked_at") || null,
    };
  });

  // ── Plan refresh: contacts server for fresh plan data ──
  ipcMain.handle("plan:refresh", async () => {
    const serverUrl = getSyncMeta("server_url");
    const token = getSyncMeta("auth_token");
    if (!serverUrl || !token) return { error: "Not logged in" };

    try {
      const res = await fetch(`${serverUrl}/api/desktop/plan-check`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body.error || `Plan check failed (${res.status})` };
      }
      const data = await res.json();
      setSyncMeta("plan", data.plan);
      setSyncMeta("plan_status", data.status);
      setSyncMeta("plan_renews_at", data.renewsAt || "");
      setSyncMeta("plan_signed_expiry", data.signedExpiry || "");
      setSyncMeta("plan_checked_at", new Date().toISOString());
      return { plan: data.plan, status: data.status, renewsAt: data.renewsAt, signedExpiry: data.signedExpiry };
    } catch (err: any) {
      return { error: err?.message || "Connection failed" };
    }
  });

  ipcMain.handle("api:serverFetch", async (_e, path: string, method: string, body?: any) => {
    const serverUrl = getSyncMeta("server_url");
    const token = getSyncMeta("auth_token");
    if (!serverUrl || !token) return { error: "Not logged in" };
    try {
      const opts: RequestInit = {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      };
      if (body && method !== "GET") opts.body = JSON.stringify(body);
      const res = await fetch(`${serverUrl}${path}`, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data.error || `Request failed (${res.status})` };
      return data;
    } catch (err: any) {
      return { error: err?.message || "Connection failed" };
    }
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

async function pushChanges(serverUrl: string, token: string): Promise<number> {
  const db = getDatabase();
  const changes = db.prepare("SELECT * FROM _change_log WHERE synced = 0 ORDER BY id ASC LIMIT 500").all() as any[];

  if (changes.length === 0) return 0;

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

  const body = await res.json().catch(() => ({} as any));
  const results: { ok: boolean; error?: string }[] | undefined = body.results;

  if (Array.isArray(results) && results.length === changes.length) {
    // Only mark changes the server actually applied. Rejected changes get
    // synced = -1 so they stop blocking the queue but stay inspectable.
    const okIds: number[] = [];
    const failedIds: number[] = [];
    changes.forEach((c, i) => (results[i]?.ok ? okIds : failedIds).push(c.id));
    if (okIds.length) {
      db.prepare(`UPDATE _change_log SET synced = 1 WHERE id IN (${okIds.map(() => "?").join(",")})`).run(...okIds);
    }
    if (failedIds.length) {
      db.prepare(`UPDATE _change_log SET synced = -1 WHERE id IN (${failedIds.map(() => "?").join(",")})`).run(...failedIds);
      results.forEach((r, i) => {
        if (!r.ok) console.error(`[sync] push rejected: ${changes[i].table_name}/${changes[i].record_id} — ${r.error}`);
      });
    }
    return okIds.length;
  }

  // Older server without per-record results — previous behaviour.
  const ids = changes.map((c) => c.id);
  db.prepare(`UPDATE _change_log SET synced = 1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  return changes.length;
}

async function pullChanges(serverUrl: string, token: string): Promise<{ applied: number; skipped: number }> {
  const lastSync = getSyncMeta("last_sync_at") || "1970-01-01T00:00:00Z";

  broadcast("sync:progress", { phase: "pulling", progress: 40, detail: "Fetching data from server..." });

  const res = await fetch(`${serverUrl}/api/desktop/sync/pull?since=${encodeURIComponent(lastSync)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Pull failed (${res.status})`);
  }

  const { changes, fullTables } = await res.json();
  const db = getDatabase();

  broadcast("sync:progress", { phase: "pulling", progress: 55, detail: `Received ${changes.length} record${changes.length !== 1 ? "s" : ""} from server`, count: changes.length });

  if (changes.length === 0) {
    return { applied: 0, skipped: 0 };
  }

  const tableColumnsCache: Record<string, Set<string>> = {};

  function getTableColumns(table: string): Set<string> {
    if (tableColumnsCache[table]) return tableColumnsCache[table];
    try {
      const info = db.prepare(`PRAGMA table_info("${table}")`).all() as any[];
      tableColumnsCache[table] = new Set(info.map((r: any) => r.name));
    } catch {
      tableColumnsCache[table] = new Set();
    }
    return tableColumnsCache[table];
  }

  let applied = 0;
  let skipped = 0;
  const tablesProcessed = new Set<string>();

  broadcast("sync:progress", { phase: "applying", progress: 60, detail: "Writing to local database..." });

  // Disable FK enforcement during the bulk apply. The server is the source of
  // truth and may send a child row before its parent, or reference a row that
  // isn't part of this batch yet. With foreign_keys ON, those inserts throw
  // "FOREIGN KEY constraint failed" and the row is skipped, leaving the local
  // DB incomplete (which then causes further FK failures on local edits).
  // `foreign_keys` cannot be toggled inside a transaction, so we toggle it
  // around the transaction and always restore it in `finally`.
  const fkWasOn = db.pragma("foreign_keys", { simple: true });
  db.pragma("foreign_keys = OFF");

  const applyChanges = db.transaction(() => {
    for (let i = 0; i < changes.length; i++) {
      const { table, recordId, action, data } = changes[i];
      tablesProcessed.add(table);

      if (i % 50 === 0 && i > 0) {
        const pct = 60 + Math.round((i / changes.length) * 30);
        broadcast("sync:progress", { phase: "applying", progress: pct, detail: `${table} (${i}/${changes.length})`, currentTable: table, count: applied });
      }

      try {
        if (action === "delete") {
          db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(recordId);
          applied++;
        } else if (action === "insert" || action === "upsert") {
          const validCols = getTableColumns(table);
          if (validCols.size === 0) {
            console.error(`[sync] SKIP: table "${table}" not found in local DB`);
            skipped++;
            continue;
          }

          const cols = Object.keys(data).filter((c) => validCols.has(c));
          if (cols.length === 0) {
            console.error(`[sync] SKIP: no matching columns for table "${table}". Data keys: ${Object.keys(data).join(", ")}`);
            skipped++;
            continue;
          }

          const placeholders = cols.map(() => "?").join(", ");
          const values = cols.map((c: string) => {
            const v = data[c];
            if (typeof v === "boolean") return v ? 1 : 0;
            if (typeof v === "object" && v !== null) return JSON.stringify(v);
            return v;
          });
          db.prepare(
            `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
          ).run(...values);
          applied++;
        }
      } catch (err: any) {
        console.error(`[sync] SKIP: table="${table}" id="${recordId}" error="${err?.message}"`);
        skipped++;
      }
    }
  });

  let deleted = 0;
  try {
    applyChanges();

    // ── Deletion reconciliation ──
    // The server sends complete snapshots for the tables in `fullTables`.
    // Any local row missing from the snapshot was deleted on the web — remove
    // it here, unless it has pending unsynced local changes (offline creates
    // that haven't pushed yet).
    if (Array.isArray(fullTables) && fullTables.length > 0) {
      const pulledIdsByTable = new Map<string, Set<string>>();
      for (const c of changes) {
        if (!pulledIdsByTable.has(c.table)) pulledIdsByTable.set(c.table, new Set());
        pulledIdsByTable.get(c.table)!.add(String(c.recordId));
      }

      const reconcile = db.transaction(() => {
        for (const table of fullTables) {
          const validCols = getTableColumns(table);
          if (!validCols.has("id")) continue;
          const pulled = pulledIdsByTable.get(table) ?? new Set<string>();
          const pending = new Set(
            (db.prepare("SELECT record_id FROM _change_log WHERE table_name = ? AND synced = 0").all(table) as any[])
              .map((r) => String(r.record_id)),
          );
          const localIds = (db.prepare(`SELECT id FROM "${table}"`).all() as any[]).map((r) => String(r.id));
          const del = db.prepare(`DELETE FROM "${table}" WHERE id = ?`);
          for (const id of localIds) {
            if (!pulled.has(id) && !pending.has(id)) {
              del.run(id);
              deleted++;
            }
          }
        }
      });
      reconcile();
    }
  } finally {
    if (fkWasOn) db.pragma("foreign_keys = ON");
  }

  broadcast("sync:progress", { phase: "applying", progress: 92, detail: `Applied ${applied} records across ${tablesProcessed.size} tables${deleted ? `, removed ${deleted} deleted` : ""}`, count: applied, skipped });

  return { applied, skipped };
}
