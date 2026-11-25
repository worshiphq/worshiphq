import "server-only";
import { z } from "zod";
import { getObject, putObject } from "@/lib/storage";

/**
 * Template profiles: songs and looks a church can start WorshipHQ Live with. Each is one file in storage, listed in
 * live-profiles/index.json (no database table needed).
 */
const text = (n: number) => z.string().max(n);
const song = z.object({
  title: text(200).min(1),
  author: text(300).optional(),
  key: text(20).optional(),
  tags: z.array(text(40)).max(20).default([]),
  sections: z.array(z.object({ id: text(60), label: text(60), lyrics: text(12000), order: z.number() })).min(1).max(60),
  order: z.array(text(60)).max(200),
  font: text(120).optional(),
  akan: z.boolean().optional(),
  translation: text(20000).optional(),
  translationName: text(60).optional(),
  ccli: text(30).optional(),
  chords: text(20000).optional(),
});
export const profileInput = z.object({
  name: text(40).trim().min(1),
  about: text(200).trim().default(""),
  songs: z.array(song).max(3000),
  looks: z.record(z.string(), z.unknown()).nullable(),
  noteLook: z.record(z.string(), z.unknown()).nullable(),
});
export type ProfileContent = z.infer<typeof profileInput>;
export interface ProfileInfo { id: string; name: string; about: string; songs: number; looks: boolean; addedAt: string; hidden?: boolean }

const INDEX = "live-profiles/index.json";
const key = (id: string) => `live-profiles/${id}.json`;
export const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function listProfiles(): Promise<ProfileInfo[]> {
  try {
    const list = JSON.parse((await getObject(INDEX)).toString("utf8")) as ProfileInfo[];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return [];
    throw e;
  }
}
export const saveList = (list: ProfileInfo[]) => putObject(INDEX, Buffer.from(JSON.stringify(list, null, 1)), "application/json");
export const readProfile = async (id: string) => JSON.parse((await getObject(key(id))).toString("utf8")) as ProfileContent;
export const saveProfile = (id: string, p: ProfileContent) => putObject(key(id), Buffer.from(JSON.stringify(p)), "application/json");
