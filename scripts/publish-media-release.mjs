// Uploads a WorshipHQ Live build to SuperAdmin › Live versions (a draft, unless --publish is given).
// 1. Build the installer (signed for updates):
//      $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw ~/.tauri/worshiphq-media-updater.key
//      $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
//      cd apps/media; npx tauri build
// 2. Publish it:
//      node --env-file=.env scripts/publish-media-release.mjs "What's new in this version" [--publish | --publish-testers]
// Apps see a published version within a few hours (or at once with Help › Check for updates).
import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const app = path.resolve("apps/media");
const version = JSON.parse(fs.readFileSync(path.join(app, "src-tauri/tauri.conf.json"), "utf8")).version;
const notes = process.argv[2] ?? "";

const dirs = ["src-tauri/target/release/bundle/nsis", "src-tauri/target-installer/release/bundle/nsis"].map((d) => path.join(app, d));
const exeName = `WorshipHQ Live_${version}_x64-setup.exe`;
const dir = dirs.find((d) => fs.existsSync(path.join(d, exeName)) && fs.existsSync(path.join(d, exeName + ".sig")));
if (!dir) throw new Error(`No signed installer for version ${version}. Build it first with TAURI_SIGNING_PRIVATE_KEY set (see the top of this file).`);

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error("R2 settings missing from the environment");
const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });

const flag = process.argv.slice(2).find((a) => a.startsWith("--publish"));
const INDEX = "media-releases/releases.json";
const list = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: INDEX })).then(async (r) => JSON.parse(await r.Body.transformToString()), (e) => { if (e.name === "NoSuchKey") return []; throw e; });
const same = list.find((r) => r.version === version);
if (same && same.status !== "draft") throw new Error(`Version ${version} has already been given out. Raise the version number and build again.`);
const key = `media-releases/${version}/WorshipHQ-Live-${version}-setup.exe`;
const exe = fs.readFileSync(path.join(dir, exeName));
console.log(`Uploading ${exeName} (${(exe.length / 1e6).toFixed(1)} MB)…`);
await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: exe, ContentType: "application/vnd.microsoft.portable-executable", CacheControl: "private, max-age=31536000, immutable" }));

const signature = fs.readFileSync(path.join(dir, exeName + ".sig"), "utf8").trim();
const at = new Date().toISOString();
const audience = flag === "--publish-testers" ? "testers" : "all";
const log = [...(same?.log ?? []), { at, what: "Uploaded", by: "script" }];
if (flag) log.push({ at, what: `Published to ${audience === "all" ? "everyone" : "testers"}`, by: "script" });
const release = { version, notes, key, signature, bytes: exe.length, status: flag ? "published" : "draft", audience, uploadedAt: at, log };
await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: INDEX, Body: JSON.stringify([release, ...list.filter((r) => r.version !== version)], null, 1), ContentType: "application/json", CacheControl: "no-store" }));
console.log(flag ? `Published WorshipHQ Live ${version} (${audience}).` : `Uploaded ${version}. Publish it in SuperAdmin › Live versions.`);
