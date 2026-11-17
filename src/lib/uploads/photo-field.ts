import "server-only";
import { storeImage } from "@/lib/storage";

/**
 * The facility-photo pattern, shared: the client sends `<field>Changed=1` and the photo (already shrunk in the browser)
 * as a data URL in `<field>`. Unchanged = undefined, removed = null, else the stored URL.
 */
export async function readPhoto(fd: FormData, field: string, folder: string): Promise<{ ok: true; value: string | null | undefined } | { ok: false; error: string }> {
  if (String(fd.get(`${field}Changed`) ?? "") !== "1") return { ok: true, value: undefined };
  const raw = String(fd.get(field) ?? "").trim();
  if (!raw) return { ok: true, value: null };
  if (!raw.startsWith("data:image/")) return { ok: false, error: "That photo could not be read. Try another." };
  if (raw.length >= 1_800_000) return { ok: false, error: "That photo is too large. Try a smaller one." };
  return { ok: true, value: ((await storeImage(raw, folder)) as string) ?? null };
}
