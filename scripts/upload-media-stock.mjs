// Uploads apps/media/stock-library (made by apps/media/stock-tools/make_backgrounds.py) to R2 under stock/
// and merges it into stock/manifest.json. Items already on the server (added in SuperAdmin) are kept.
// Usage: node --env-file=.env scripts/upload-media-stock.mjs [library-dir]
import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const dir = path.resolve(process.argv[2] ?? "apps/media/stock-library");
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error("R2 settings missing from the environment");
const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
const TYPES = { jpg: "image/jpeg", mp4: "video/mp4", json: "application/json" };

async function put(key, file) {
  const size = fs.statSync(file).size;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (head.ContentLength === size) return false; // already there
  } catch { /* not there yet */ }
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: fs.readFileSync(file), ContentType: TYPES[file.split(".").pop()] ?? "application/octet-stream", CacheControl: "private, max-age=31536000, immutable" }));
  return true;
}

const local = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
let remote = { version: 1, items: [] };
try {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: "stock/manifest.json" }));
  remote = JSON.parse(await res.Body.transformToString());
} catch { /* first upload */ }

let sent = 0;
for (const item of local.items) {
  for (const rel of [item.file, item.thumb]) if (await put(`stock/${rel}`, path.join(dir, rel))) sent++;
  process.stdout.write(`\r${item.id.padEnd(30)}`);
}
const byId = new Map(remote.items.map((i) => [i.id, i]));
for (const item of local.items) byId.set(item.id, { ...item, hidden: byId.get(item.id)?.hidden, credit: "Made by WorshipHQ", addedAt: byId.get(item.id)?.addedAt ?? new Date().toISOString() });
const merged = { version: 1, credit: local.credit, items: [...byId.values()] };
await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: "stock/manifest.json", Body: JSON.stringify(merged, null, 1), ContentType: "application/json" }));
console.log(`\nUploaded ${sent} files. The library now has ${merged.items.length} backgrounds.`);
