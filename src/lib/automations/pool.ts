import "server-only";

/** Epoch-ms wall-clock after which no NEW unit of work should be started. */
export type Deadline = number | undefined;

/**
 * Run `fn` for every item with bounded parallelism, never starting new work past
 * the deadline. One item throwing is logged and isolated - it can't stop the rest.
 *
 * This is what lets the scheduled job scale past one-church-at-a-time: different
 * churches share nothing (each has its own SMS credits and rows), so they can run
 * side by side. Anything skipped at the deadline is simply picked up by the next
 * (hourly) run, because every task is idempotent per church/record.
 *
 * Do NOT use this to parallelise work *within* one church's SMS sending: sends
 * check then decrement that church's credit balance, which is not race-safe.
 */
export async function forEachChurch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  opts: { concurrency?: number; deadline?: Deadline; label?: string } = {},
): Promise<{ done: number; skipped: number; failed: number }> {
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  let next = 0;
  let done = 0;
  let failed = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        if (opts.deadline !== undefined && Date.now() >= opts.deadline) return;
        const item = items[next++];
        try {
          await fn(item);
          done++;
        } catch (e) {
          failed++;
          console.error(`[automations${opts.label ? `:${opts.label}` : ""}] one item failed:`, e);
        }
      }
    }),
  );

  return { done, skipped: items.length - next, failed };
}
