"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin, requireSuperAdminOwner } from "@/lib/auth";
import { sendEmail } from "@/lib/integrations/email";
import { outreachContact } from "@/lib/outreach/send";
import { STEPS, type StepId } from "@/lib/lifecycle/steps";
import { buildEmail, getSequenceSettings, liveNumbers, mergeData, readSettings, runEmailSequence } from "@/lib/lifecycle/run";
import { SAMPLE } from "@/lib/lifecycle/sample";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Switch the sequence on or off, switch single emails, set the daily cap. Owner only. */
export async function saveSequenceSettings(input: { enabled: boolean; dailyCap: number; steps: Record<string, boolean> }): Promise<Result> {
  await requireSuperAdminOwner();
  const next = readSettings({ enabled: !!input.enabled, dailyCap: input.dailyCap, steps: Object.fromEntries(STEPS.map((s) => [s.id, input.steps?.[s.id] !== false])) });
  await db.platformConfig.update({ where: { id: "default" }, data: { lifecycleSettings: next } });
  revalidatePath("/admin/sequence");
  return { ok: true, message: next.enabled ? "Saved. The sequence is ON: emails go out each morning between 7 and 11." : "Saved. The sequence is off." };
}

/** Send one email of the sequence to the SuperAdmin's own inbox, filled in with sample church details. */
export async function sendSequenceTest(stepId: string): Promise<Result> {
  const sa = await requireSuperAdmin();
  const step = STEPS.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: "That email was not found." };
  const live = await liveNumbers();
  const data = mergeData(live, { ...SAMPLE, facts: SAMPLE.facts, resume: "sample" });
  const mail = buildEmail(step.id as StepId, data, undefined, step.id === "finish-signup");
  const r = await sendEmail({ to: sa.email, subject: `[Test] ${mail.subject}`, html: mail.html, replyTo: outreachContact() });
  if (r.stubbed) return { ok: true, message: "Email is not set up here, so nothing was really sent (test mode)." };
  return r.ok ? { ok: true, message: `Sent to ${sa.email}.` } : { ok: false, error: r.error ?? "The email provider refused it." };
}

export type BatchResult = { ok: true; sent: number; failed: number; more: boolean; note?: string } | { ok: false; error: string };

/**
 * Send one short batch of what is due, within the daily cap, even outside the morning window. Owner only.
 * The host stops a request after about 10 seconds, so each batch stops starting new emails after 6; the button
 * calls this again and again until nothing is left or the daily cap is reached.
 */
export async function runSequenceBatch(): Promise<BatchResult> {
  await requireSuperAdminOwner();
  const s = await getSequenceSettings();
  if (!s.enabled) return { ok: false, error: "Switch the sequence on and save first." };
  const r = await runEmailSequence(new Date(), { force: true, budgetMs: 6_000 }) as { sent?: number; failed?: number; more?: boolean; skipped?: string; stopped?: string };
  if (r.skipped) return { ok: true, sent: 0, failed: 0, more: false, note: r.skipped };
  if (r.stopped) return { ok: true, sent: r.sent ?? 0, failed: r.failed ?? 0, more: false, note: r.stopped };
  return { ok: true, sent: r.sent ?? 0, failed: r.failed ?? 0, more: !!r.more };
}

/** Refresh the page's numbers after a run of batches. */
export async function refreshSequencePage(): Promise<void> {
  await requireSuperAdmin();
  revalidatePath("/admin/sequence");
}
