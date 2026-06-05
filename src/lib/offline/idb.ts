/**
 * Tiny dependency-free IndexedDB wrapper for offline caching of recent records.
 *
 * The dashboard caches recently-viewed records here so the app loads instantly
 * and stays usable when the connection drops (common in Ghana). Writes made
 * while offline are queued in the "outbox" store and flushed on reconnect.
 */

const DB_NAME = "worshiphq";
const DB_VERSION = 1;

export type StoreName = "records" | "outbox";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records");
      if (!db.objectStoreNames.contains("outbox"))
        db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

/** Cache a record (e.g. `people:list`) for offline/instant reads. */
export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    await tx("records", "readwrite", (s) => s.put({ value, cachedAt: Date.now() }, key));
  } catch {
    /* offline cache is best-effort */
  }
}

export async function cacheGet<T>(key: string): Promise<{ value: T; cachedAt: number } | null> {
  try {
    return (await tx("records", "readonly", (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

/** Queue a write to be synced when back online. */
export async function queueWrite(payload: { url: string; method: string; body?: unknown }): Promise<void> {
  await tx("outbox", "readwrite", (s) => s.add({ ...payload, queuedAt: Date.now() }));
}

export async function getOutbox(): Promise<Array<{ id: number; url: string; method: string; body?: unknown }>> {
  try {
    return (await tx("outbox", "readonly", (s) => s.getAll())) ?? [];
  } catch {
    return [];
  }
}

export async function clearOutboxItem(id: number): Promise<void> {
  await tx("outbox", "readwrite", (s) => s.delete(id));
}
