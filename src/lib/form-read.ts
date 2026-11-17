/**
 * Small readers for FormData in server actions. Every value is trimmed; empty means null.
 */

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const strOrNull = (fd: FormData, key: string) => str(fd, key) || null;

export function num(fd: FormData, key: string): number | null {
  const s = str(fd, key).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A YYYY-MM-DD field as midnight UTC (Ghana time), or null. */
export function dateOf(fd: FormData, key: string): Date | null {
  const s = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A YYYY-MM-DDTHH:mm field (local wall time, read as UTC = Ghana time), or null. */
export function dateTimeOf(fd: FormData, key: string): Date | null {
  const s = str(fd, key);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateOf(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 16)}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const bool = (fd: FormData, key: string) => ["on", "1", "true", "yes"].includes(str(fd, key));

/** The message of a thrown guard (demo, plan, permission), for a `{ ok: false, error }` reply. */
export function errorText(e: unknown): string {
  const msg = (e as Error)?.message;
  if (!msg || msg === "NEXT_REDIRECT" || (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  return msg;
}
