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
