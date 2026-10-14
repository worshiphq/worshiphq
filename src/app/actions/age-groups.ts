"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManage } from "@/lib/permissions";
import { normaliseAgeConfig, ageOf, isYouthAge, type AgeConfig } from "@/lib/age";
import { getAgeConfig, ageMoves, applyAgeMoves } from "@/lib/data/age";

export type AgeSettings = {
  config: AgeConfig;
  /** Children and teens who are already past their band and would move up. */
  pending: { name: string; from: string; to: string; age: number }[];
  pendingTotal: number;
  youthCount: number;
};

/** The age bands, and a preview of who would move up. */
export async function getAgeSettings(): Promise<AgeSettings> {
  const session = await requireSession();
  const config = await getAgeConfig(session.churchId);
  return preview(session.churchId, config);
}

async function preview(churchId: string, config: AgeConfig): Promise<AgeSettings> {
  const [moves, adults] = await Promise.all([
    ageMoves(churchId, config),
    config.youthOn
      ? db.person.findMany({ where: { churchId, dateOfBirth: { not: null }, OR: [{ ageGroup: null }, { ageGroup: "adult" }] }, select: { dateOfBirth: true } })
      : Promise.resolve([] as { dateOfBirth: Date | null }[]),
  ]);
  return {
    config,
    pending: moves.slice(0, 8).map((m) => ({ name: m.name, from: m.from, to: m.to, age: m.age })),
    pendingTotal: moves.length,
    youthCount: adults.filter((a) => isYouthAge(ageOf(a.dateOfBirth), config)).length,
  };
}

/** Preview the bands without saving them (so the screen can show what a change would do). */
export async function previewAgeSettings(input: Partial<AgeConfig>): Promise<AgeSettings> {
  const session = await requireSession();
  return preview(session.churchId, normaliseAgeConfig(input));
}

export async function saveAgeSettings(input: Partial<AgeConfig>) {
  const session = await requireSession();
  assertCanWrite(session, "people");
  if (!canManage(session, "people")) return { ok: false as const, error: "Only people who manage members can change this." };
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const c = normaliseAgeConfig(input);
  await db.church.update({
    where: { id: session.churchId },
    data: { ageChildMax: c.childMax, ageTeenMax: c.teenMax, ageYouthOn: c.youthOn, ageYouthMax: c.youthMax, ageYouthLabel: c.youthLabel, ageAutoOn: c.autoOn },
  });
  // Switching it on moves anyone already past their band straight away, then the daily check keeps it up to date.
  const moved = c.autoOn ? await applyAgeMoves(session.churchId, c) : [];
  await audit(session, "update", "settings", `Set age groups: children to ${c.childMax}, teens to ${c.teenMax}${c.youthOn ? `, ${c.youthLabel} to ${c.youthMax}` : ""}, automatic moves ${c.autoOn ? `on (${moved.length} moved)` : "off"}`);
  revalidatePath("/app/people");
  revalidatePath("/app/settings");
  revalidatePath("/app/attendance");
  return { ok: true as const, moved: moved.length };
}
