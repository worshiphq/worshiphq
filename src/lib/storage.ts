import "server-only";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

/**
 * Image storage. Images used to be stored as base64 data URLs directly in
 * Postgres, which blew up DB egress. When a storage backend is configured,
 * `storeImage` uploads the data URL and returns a short CDN URL to save
 * instead. When nothing is configured (e.g. local dev without keys), it
 * returns the input unchanged so uploads still work as before.
 *
 * Cloudflare R2 is the preferred backend - zero egress fees, so there's no
 * repeat of the Supabase Storage quota outage (every view of an image used
 * to count against Supabase's bandwidth cap; R2 has no such cap). Supabase
 * Storage is kept as a fallback for churches/environments where only that's
 * configured, but new setups should use R2.
 */

const R2_CONFIGURED = !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_PUBLIC_URL);
const SUPABASE_CONFIGURED = !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIGURED = R2_CONFIGURED || SUPABASE_CONFIGURED;

const SUPABASE_BUCKET = env.SUPABASE_STORAGE_BUCKET;

let r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return r2Client;
}

function supabaseBaseUrl() {
  return (env.SUPABASE_URL ?? "").replace(/\/$/, "");
}
function supabaseAuthHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(extra ?? {}) };
}

let supabaseBucketReady = false;
/** Create the public Supabase bucket once (idempotent - "already exists" is fine). */
async function ensureSupabaseBucket() {
  if (supabaseBucketReady) return;
  try {
    await fetch(`${supabaseBaseUrl()}/storage/v1/bucket`, {
      method: "POST",
      headers: supabaseAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: SUPABASE_BUCKET, name: SUPABASE_BUCKET, public: true, file_size_limit: 5_242_880 }),
    });
  } catch {
    /* ignore - upload will surface a real failure */
  }
  supabaseBucketReady = true;
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

async function uploadToR2(name: string, parsed: { buf: Buffer; contentType: string }): Promise<string | null> {
  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: name,
        Body: parsed.buf,
        ContentType: parsed.contentType,
        // Every upload gets a fresh, never-reused filename (timestamp + random),
        // so it's always safe to cache forever - no CDN/browser re-fetch, no
        // repeat of the egress-quota outage this replaced.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${name}`;
  } catch {
    return null;
  }
}

async function uploadToSupabase(name: string, parsed: { buf: Buffer; contentType: string }): Promise<string | null> {
  try {
    await ensureSupabaseBucket();
    const res = await fetch(`${supabaseBaseUrl()}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURI(name)}`, {
      method: "POST",
      headers: supabaseAuthHeaders({
        "Content-Type": parsed.contentType,
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000, immutable",
      }),
      body: parsed.buf as unknown as BodyInit,
    });
    if (!res.ok) return null;
    return `${supabaseBaseUrl()}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURI(name)}`;
  } catch {
    return null;
  }
}

/**
 * Persist an image. If `input` is a `data:image/...` URL, uploads it to R2
 * (preferred) or Supabase Storage (fallback) and returns the public URL.
 * Otherwise returns `input` unchanged (already a URL, empty, or nothing
 * configured).
 */
export async function storeImage(
  input: string | null | undefined,
  folder: string,
): Promise<string | null | undefined> {
  if (!input || !input.startsWith("data:image/")) return input;
  if (!CONFIGURED) return input;
  const parsed = parseDataUrl(input);
  if (!parsed) return input;

  const name = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${parsed.ext}`;

  if (R2_CONFIGURED) {
    const url = await uploadToR2(name, parsed);
    if (url) return url;
    // Fall through to Supabase if R2 is configured but the upload failed,
    // rather than losing the image entirely.
  }
  if (SUPABASE_CONFIGURED) {
    const url = await uploadToSupabase(name, parsed);
    if (url) return url;
  }
  return input; // keep the base64 rather than losing the image
}

/* ── Raw object access (used for encrypted backups) ── */

export const r2Ready = R2_CONFIGURED;

export async function putObject(key: string, body: Buffer, contentType = "application/octet-stream"): Promise<void> {
  await getR2Client().send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await getR2Client().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
