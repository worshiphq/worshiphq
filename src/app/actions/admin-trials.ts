"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { startTrial, extendTrial, endTrial, saveTrialSettings } from "@/lib/trials";
import { normalizeTrialSettings, type TrialSettings } from "@/lib/trial-settings";

type Ok = { ok: true; message: string };
type Fail = { ok: false; error: string };

/** The trial rules: on or off, how many days, and which upgrades can be tried. Running trials keep their own end date. */
export async function saveTrialSettingsAction(input: TrialSettings): Promise<Ok | Fail> {
  await requireSuperAdmin();
  const next = normalizeTrialSettings(input);
  await logAdminAction("saveTrialSettings", { settings: next });
  await saveTrialSettings(next);
  revalidatePath("/admin/trials");
  return { ok: true, message: next.enabled ? `Trials are on: ${next.days} days.` : "Trials are switched off." };
}

/** Give a church a trial of the next plan up, even if it has had one before or trials are switched off. */
export async function grantTrial(churchId: string, days: number): Promise<Ok | Fail> {
  await requireSuperAdmin();
  await logAdminAction("grantTrial", { churchId, days });
  const res = await startTrial(churchId, { force: true, days });
  if (!res.ok) return res;
  revalidatePath("/admin/trials");
  return { ok: true, message: `A ${res.plan} trial has started.` };
}

/** Add days to a trial (re-opens one that just ended). */
export async function extendTrialAction(churchId: string, days: number): Promise<Ok | Fail> {
  await requireSuperAdmin();
  await logAdminAction("extendTrial", { churchId, days });
  const res = await extendTrial(churchId, days);
  if (!res.ok) return res;
  revalidatePath("/admin/trials");
  return { ok: true, message: `The ${res.plan} trial now runs until ${new Date(res.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` };
}

/** End a trial now. */
export async function endTrialAction(churchId: string): Promise<Ok | Fail> {
  await requireSuperAdmin();
  await logAdminAction("endTrial", { churchId });
  const res = await endTrial(churchId);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not end it." };
  revalidatePath("/admin/trials");
  return { ok: true, message: "The trial has ended." };
}

type Bulk = { ok: true; message: string; done: number; skipped: number } | { ok: false; error: string };

/** Start a trial for many churches. Running trials and churches on the top plan are skipped, and counted. */
export async function grantTrialBulk(churchIds: string[], days: number): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("grantTrialBulk", { count: ids.length, days });
  let done = 0, skipped = 0;
  for (const id of ids) {
    const res = await startTrial(id, { force: true, days });
    if (res.ok) done++; else skipped++;
  }
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped, message: `${done} trial${done === 1 ? "" : "s"} started${skipped ? `, ${skipped} skipped (already on a trial or on the top plan)` : ""}.` };
}

export async function extendTrialBulk(churchIds: string[], days: number): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("extendTrialBulk", { count: ids.length, days });
  let done = 0, skipped = 0;
  for (const id of ids) { const res = await extendTrial(id, days); if (res.ok) done++; else skipped++; }
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped, message: `${done} trial${done === 1 ? "" : "s"} extended by ${days} days${skipped ? `, ${skipped} had no trial` : ""}.` };
}

export async function endTrialBulk(churchIds: string[]): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("endTrialBulk", { count: ids.length });
  let done = 0, skipped = 0;
  for (const id of ids) { const res = await endTrial(id); if (res.ok) done++; else skipped++; }
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped, message: `${done} trial${done === 1 ? "" : "s"} ended${skipped ? `, ${skipped} were not running` : ""}.` };
}
