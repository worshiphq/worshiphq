import "server-only";

/**
 * A small in-memory cache, kept inside one running server instance, for data that many requests read and that
 * rarely changes. Each hit saves a database round trip and the work of decoding it, which is what Vercel bills as
 * Active CPU, so the busiest shared reads pay for themselves many times over.
 *
 * Only use it for data where being a little out of date is harmless. Another instance can serve the old value for
 * up to `ttlMs` after a change, so never put anything here that decides who may see or pay for something right now
 * (sessions, permissions, a church's subscription).
 *
 * Failures are never cached, and concurrent callers share one load instead of each going to the database.
 */
type Entry = { value?: unknown; at: number; loading?: Promise<unknown> };

const MAX_ENTRIES = 1000;
const store = new Map<string, Entry>();

export async function ttlCached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.at > 0 && now - hit.at < ttlMs) return hit.value as T;
  if (hit?.loading) return hit.loading as Promise<T>;

  const loading = load().then(
    (value) => {
      // Oldest first, because a Map keeps insertion order. Re-inserting moves a refreshed key to the back.
      store.delete(key);
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, at: Date.now() });
      return value;
    },
    (err) => {
      // Keep serving nothing rather than a failure: the next caller tries again.
      if (hit && hit.at > 0) store.set(key, { value: hit.value, at: hit.at });
      else store.delete(key);
      throw err;
    },
  );
  store.set(key, { value: hit?.value, at: hit?.at ?? 0, loading });
  return loading;
}

/** Forget a value, so this instance reads fresh data on the next request (after a save, say). */
export function ttlInvalidate(key: string): void {
  store.delete(key);
}
