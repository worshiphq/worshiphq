/**
 * One-off: migrate existing member/staff/church images from Supabase Storage
 * (and leftover base64-in-DB) to Cloudflare R2, then point the DB field at the
 * R2 URL. New uploads already go to R2 via src/lib/storage.ts.
 *
 *   npx tsx scripts/migrate-images-to-r2.ts         # DRY RUN (no writes)
 *   npx tsx scripts/migrate-images-to-r2.ts --apply # do it
 *
 * Safe: never deletes the Supabase originals, skips values already on R2, and
 * writes a rollback map (id -> old URL) to scripts/image-migration-rollback.json.
 */
import "server-only";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { putObject, r2Ready } from "@/lib/storage";

const APPLY = process.argv.includes("--apply");
const SB = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const R2 = (env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
const SB_BUCKET = env.SUPABASE_STORAGE_BUCKET;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
};

type Col = { model: "church" | "user" | "person" | "visitor"; field: "logoUrl" | "photoUrl"; folder: string };
const COLS: Col[] = [
  { model: "church", field: "logoUrl", folder: "logos" },
  { model: "user", field: "photoUrl", folder: "staff" },
  { model: "person", field: "photoUrl", folder: "members" },
  { model: "visitor", field: "photoUrl", folder: "visitors" },
];

function isR2(v: string) { return R2 && v.startsWith(R2); }
function isSupabase(v: string) { return v.includes("/storage/v1/object"); }
function isBase64(v: string) { return v.startsWith("data:"); }

/** Reuse the Supabase object key so the filename stays stable across the move. */
function keyFromSupabase(url: string): string | null {
  const marker = `/public/${SB_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) {
    // some rows may be the non-public upload path
    const m2 = `/object/${SB_BUCKET}/`;
    const j = url.indexOf(m2);
    if (j === -1) return null;
    return decodeURIComponent(url.slice(j + m2.length).split("?")[0]);
  }
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

async function bytesFromSupabase(url: string): Promise<{ buf: Buffer; ct: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn(`  fetch ${res.status} for ${url.slice(0, 80)}`); return null; }
    const ct = res.headers.get("content-type") || "application/octet-stream";
    return { buf: Buffer.from(await res.arrayBuffer()), ct };
  } catch (e) {
    console.warn("  fetch failed:", (e as Error).message);
    return null;
  }
}

function bytesFromBase64(dataUrl: string): { buf: Buffer; ct: string } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const ct = m[1] || "image/jpeg";
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  return { buf, ct };
}

async function run() {
  if (!r2Ready) throw new Error("R2 is not configured (check R2_* env vars).");
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} · R2=${R2} · Supabase bucket=${SB_BUCKET}\n`);

  const rollback: Record<string, { field: string; old: string; new: string }> = {};
  let migrated = 0, skipped = 0, failed = 0;

  for (const col of COLS) {
    const delegate = (db as unknown as Record<string, { findMany: Function; update: Function }>)[col.model];
    const rows: { id: string; [k: string]: unknown }[] = await delegate.findMany({ select: { id: true, [col.field]: true } });
    let touched = 0;
    for (const row of rows) {
      const v = row[col.field] as string | null;
      if (!v || isR2(v)) continue;

      let got: { buf: Buffer; ct: string } | null = null;
      let origKey: string | null = null;
      if (isSupabase(v)) { got = await bytesFromSupabase(v); origKey = keyFromSupabase(v); }
      else if (isBase64(v)) { got = bytesFromBase64(v); }
      else continue; // external URL we don't own - leave it

      if (!got) { failed++; console.warn(`  FAIL read ${col.model}.${col.field} ${row.id}`); continue; }

      const ext = EXT_BY_MIME[got.ct.toLowerCase()] ?? "jpg";
      const key = origKey ?? `${col.folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
      const newUrl = `${R2}/${key}`;

      if (APPLY) {
        try {
          await putObject(key, got.buf, got.ct);
          await delegate.update({ where: { id: row.id }, data: { [col.field]: newUrl } });
        } catch (e) {
          failed++; console.warn(`  FAIL write ${col.model} ${row.id}:`, (e as Error).message); continue;
        }
      }
      rollback[`${col.model}:${row.id}`] = { field: col.field, old: v.slice(0, 500), new: newUrl };
      migrated++; touched++;
      if (touched <= 2) console.log(`  ${col.model}.${col.field} ${row.id} -> ${key} (${(got.buf.length/1024).toFixed(0)}KB, ${got.ct})`);
    }
    console.log(`${col.model}.${col.field}: ${touched} to migrate`);
  }

  console.log(`\n${APPLY ? "Migrated" : "Would migrate"}: ${migrated} · failed: ${failed}`);
  if (APPLY) {
    const out = path.join(process.cwd(), "scripts", "image-migration-rollback.json");
    fs.writeFileSync(out, JSON.stringify(rollback, null, 2));
    console.log(`Rollback map written: ${out}`);
  } else {
    console.log("Re-run with --apply to perform the migration.");
  }
}
run().catch((e) => { console.error("ERROR", e); process.exit(1); }).finally(() => db.$disconnect());
