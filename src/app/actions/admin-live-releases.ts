"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { signedGetUrl, signedPutUrl } from "@/lib/storage";
import { listReleases, saveReleases, type LiveRelease } from "@/lib/live-release";

type Result = { ok: boolean; error?: string };
const TYPE = "application/vnd.microsoft.portable-executable";
const VERSION = /^\d{1,3}\.\d{1,4}\.\d{1,5}$/;
const keyFor = (v: string) => `media-releases/${v}/WorshipHQ-Live-${v}-setup.exe`;
const failed = (e: unknown): Result => {
  console.error("[live-releases]", e);
  return { ok: false, error: "Storage didn't answer. Nothing was changed." };
};

/** The signature file must belong to this installer (a wrong one would make every update fail). */
function signatureProblem(signature: string, version: string): string | null {
  const text = Buffer.from(String(signature).trim(), "base64").toString("utf8");
  const file = text.match(/file:([^\t\n\r]+)/)?.[1];
  if (!text.includes("untrusted comment") || !file) return "That isn't a signature file. Choose the .exe.sig made with the installer.";
  return file.includes(`_${version}_`) ? null : `That signature is for ${file}, not version ${version}.`;
}

/** Step 1: a link to upload the installer to. */
export async function startReleaseUpload(version: string, signature: string): Promise<Result & { url?: string; contentType?: string }> {
  await requireSuperAdmin();
  if (!VERSION.test(version)) return { ok: false, error: "The file name must have the version in it, like 1.0.3." };
  const problem = signatureProblem(signature, version);
  if (problem) return { ok: false, error: problem };
  try {
    const same = (await listReleases(true)).find((r) => r.version === version);
    if (same && same.status !== "draft") return { ok: false, error: `Version ${version} has already been given out. Build a new version number.` };
    return { ok: true, url: await signedPutUrl(keyFor(version), TYPE), contentType: TYPE };
  } catch (e) { return failed(e); }
}

/** Step 2: the file is there. Kept as a draft until it is published. */
export async function finishReleaseUpload(version: string, signature: string, notes: string, bytes: number): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!VERSION.test(version)) return { ok: false, error: "Wrong version." };
  const problem = signatureProblem(signature, version);
  if (problem) return { ok: false, error: problem };
  try {
    const list = await listReleases(true);
    const same = list.find((r) => r.version === version);
    if (same && same.status !== "draft") return { ok: false, error: `Version ${version} has already been given out.` };
    const head = await fetch(await signedGetUrl(keyFor(version), 120), { headers: { Range: "bytes=0-1" }, cache: "no-store" });
    const size = Number(head.headers.get("content-range")?.split("/")[1]);
    if (!head.ok || size !== bytes) return { ok: false, error: "The installer didn't arrive whole. Upload it again." };
    const at = new Date().toISOString();
    const r: LiveRelease = {
      version, notes: String(notes).trim().slice(0, 2000), key: keyFor(version), signature: signature.trim(), bytes, status: "draft", audience: "all", uploadedAt: at,
      log: [...(same?.log ?? []), { at, what: "Uploaded", by: admin.email }],
    };
    await saveReleases([r, ...list.filter((x) => x.version !== version)]);
    await logAdminAction("uploadLiveRelease", { version });
  } catch (e) { return failed(e); }
  revalidatePath("/admin/live-releases");
  return { ok: true };
}

export async function changeRelease(version: string, change: { status?: "published" | "withdrawn"; audience?: "all" | "testers" }): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    const list = await listReleases(true);
    const r = list.find((x) => x.version === version);
    if (!r) return { ok: false, error: "That version isn't there any more." };
    if (change.audience === "all" || change.audience === "testers") r.audience = change.audience;
    let what = "";
    if (change.status === "published") { r.status = "published"; what = `Published to ${r.audience === "all" ? "everyone" : "testers"}`; }
    if (change.status === "withdrawn") { r.status = "withdrawn"; what = "Unpublished"; }
    if (!what) return { ok: false, error: "Nothing to change." };
    r.log.push({ at: new Date().toISOString(), what, by: admin.email });
    await saveReleases(list);
    await logAdminAction("changeLiveRelease", { version, what });
  } catch (e) { return failed(e); }
  revalidatePath("/admin/live-releases");
  return { ok: true };
}
