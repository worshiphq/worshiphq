import "server-only";
import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * Image storage. Images used to be stored as base64 data URLs directly in
 * Postgres, which blew up DB egress. When Supabase Storage is configured,
 * `storeImage` uploads the data URL to a public bucket and returns a short CDN
 * URL to save instead. When it's NOT configured (e.g. local dev without keys),
 * it returns the input unchanged so uploads still work as before.
 *
 * Uses Supabase's REST API with the service-role key — no SDK dependency, and
 * no anon client (so table RLS exposure isn't reintroduced).
 */

const BUCKET = env.SUPABASE_STORAGE_BUCKET;
// Active whenever the Supabase Storage keys are present (regardless of the
// legacy STORAGE_PROVIDER value), so images move out of the DB automatically.
const CONFIGURED = !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;

let bucketReady = false;

function baseUrl() {
  return (env.SUPABASE_URL ?? "").replace(/\/$/, "");
}
function authHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(extra ?? {}) };
}

/** Create the public bucket once (idempotent — "already exists" is fine). */
async function ensureBucket() {
  if (bucketReady) return;
  try {
    await fetch(`${baseUrl()}/storage/v1/bucket`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5_242_880 }),
    });
  } catch {
    /* ignore — upload will surface a real failure */
  }
  bucketReady = true;
}

function parseDataUrl(dataUrl: string): { buf: Buffer; contentType: string; ext: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const buf = Buffer.from(m[2], "base64");
  const ext = (contentType.split("/")[1] ?? "bin").split("+")[0].replace(/[^a-z0-9]/gi, "") || "bin";
  return { buf, contentType, ext };
}

export function storageConfigured() {
  return CONFIGURED;
}

/**
 * Persist an image. If `input` is a `data:image/...` URL and Storage is
 * configured, uploads it and returns the public URL. Otherwise returns `input`
 * unchanged (already a URL, empty, or storage not set up).
 */
export async function storeImage(
  input: string | null | undefined,
  folder: string,
): Promise<string | null | undefined> {
  if (!input || !input.startsWith("data:image/")) return input;
  if (!CONFIGURED) return input;
  const parsed = parseDataUrl(input);
  if (!parsed) return input;

  try {
    await ensureBucket();
    const name = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${parsed.ext}`;
    const res = await fetch(`${baseUrl()}/storage/v1/object/${BUCKET}/${encodeURI(name)}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": parsed.contentType, "x-upsert": "true" }),
      body: parsed.buf as unknown as BodyInit,
    });
    if (!res.ok) return input; // keep the base64 rather than losing the image
    return `${baseUrl()}/storage/v1/object/public/${BUCKET}/${encodeURI(name)}`;
  } catch {
    return input;
  }
}
