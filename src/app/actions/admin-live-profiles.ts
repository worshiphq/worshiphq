"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { deleteObject } from "@/lib/storage";
import { listProfiles, profileInput, saveList, saveProfile, validId } from "@/lib/live-profiles";

type Result = { ok: boolean; error?: string };
const failed = (e: unknown): Result => {
  console.error("[live-profiles]", e);
  return { ok: false, error: "Storage didn't answer. Try again." };
};

/** Shares a profile with churches. One with the same name is replaced. */
export async function addLiveProfile(json: string, mayShare: boolean): Promise<Result> {
  await requireSuperAdmin();
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { ok: false, error: "That file couldn't be read." }; }
  const p = profileInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "That isn't a profile from WorshipHQ Live, or it is too big." };
  if (p.data.songs.length && !mayShare) return { ok: false, error: "Tick that these songs may be shared." };
  try {
    const list = await listProfiles();
    const same = list.find((x) => x.name.toLowerCase() === p.data.name.toLowerCase());
    const id = same?.id ?? crypto.randomUUID();
    await saveProfile(id, p.data);
    await saveList([{ id, name: p.data.name, about: p.data.about, songs: p.data.songs.length, looks: !!p.data.looks, addedAt: new Date().toISOString() }, ...list.filter((x) => x.id !== id)]);
    await logAdminAction("addLiveProfile", { name: p.data.name, songs: p.data.songs.length });
  } catch (e) { return failed(e); }
  revalidatePath("/admin/media-trials");
  return { ok: true };
}

export async function changeLiveProfile(id: string, what: "show" | "hide" | "delete"): Promise<Result> {
  await requireSuperAdmin();
  if (!validId(id)) return { ok: false, error: "Not found." };
  try {
    const list = await listProfiles();
    await saveList(what === "delete" ? list.filter((x) => x.id !== id) : list.map((x) => (x.id === id ? { ...x, hidden: what === "hide" } : x)));
    if (what === "delete") await deleteObject(`live-profiles/${id}.json`);
    await logAdminAction("changeLiveProfile", { id, what });
  } catch (e) { return failed(e); }
  revalidatePath("/admin/media-trials");
  return { ok: true };
}
