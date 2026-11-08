"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { startTrial, extendTrial, endTrial, resetTrial, saveTrialSettings, inviteToTrial, uninviteFromTrial, grantCommsMonth, endCommsMonth } from "@/lib/trials";
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

/** Cancel the trial and give the church its Start button back, so it can start the trial itself. */
export async function resetTrialAction(churchId: string): Promise<Ok | Fail> {
  await requireSuperAdmin();
  await logAdminAction("resetTrial", { churchId });
  const res = await resetTrial(churchId);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not reset it." };
  revalidatePath("/admin/trials");
  return { ok: true, message: "The trial was reset. The church can start it itself again." };
}

export async function resetTrialBulk(churchIds: string[]): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("resetTrialBulk", { count: ids.length });
  let done = 0, skipped = 0;
  for (const id of ids) { const res = await resetTrial(id); if (res.ok) done++; else skipped++; }
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped, message: `${done} trial${done === 1 ? "" : "s"} reset${skipped ? `, ${skipped} had no trial` : ""}. Those churches can start it themselves again.` };
}

/** Invite churches to start the trial themselves. They see the Start button; nothing starts until they press it. */
export async function inviteTrialBulk(churchIds: string[]): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("inviteTrialBulk", { count: ids.length });
  const done = await inviteToTrial(ids);
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped: 0, message: `${done} church${done === 1 ? "" : "es"} invited. They can now start the trial themselves.` };
}

export async function uninviteTrialBulk(churchIds: string[]): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("uninviteTrialBulk", { count: ids.length });
  const done = await uninviteFromTrial(ids);
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped: ids.length - done, message: `${done} invitation${done === 1 ? "" : "s"} removed.` };
}

/** Switch on the free month of Communications for many churches. */
export async function grantCommsBulk(churchIds: string[], days: number): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("grantCommsBulk", { count: ids.length, days });
  let done = 0, skipped = 0;
  for (const id of ids) { const res = await grantCommsMonth(id, days); if (res.ok) done++; else skipped++; }
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped, message: `Communications switched on for ${done} church${done === 1 ? "" : "es"} for ${days} days${skipped ? `, ${skipped} skipped (already on a paid plan)` : ""}.` };
}

export async function endCommsBulk(churchIds: string[]): Promise<Bulk> {
  await requireSuperAdmin();
  const ids = [...new Set(churchIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one church." };
  await logAdminAction("endCommsBulk", { count: ids.length });
  let done = 0, skipped = 0;
  for (const id of ids) { if (await endCommsMonth(id)) done++; else skipped++; }
  revalidatePath("/admin/trials");
  return { ok: true, done, skipped, message: `Communications ended for ${done} church${done === 1 ? "" : "es"}${skipped ? `, ${skipped} had none` : ""}.` };
}
