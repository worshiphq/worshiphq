import "server-only";
import { runAutomations } from "./run";
import { refreshUsdToGhsRate } from "@/lib/integrations/fx";
import { runPledgeReminders } from "@/lib/pledges/reminders";
import { runBillingCycle } from "@/lib/billing/renewals";
import { runBirthdays } from "./birthdays";
import { runRosterAnnouncements } from "./roster-announce";
import { runRosterReminders } from "./roster-reminders";
import { runGroupMeetingReminders } from "./group-meetings";
import { runScheduledBackups } from "@/lib/backups/run";
import { runFollowUpDigest } from "@/lib/follow-ups/digest";

/** Run one task, but never let its failure abort the whole batch. */
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[automations] ${label} failed:`, e);
    return { error: (e as Error)?.message ?? "failed" };
  }
}

// The cron request is capped at 60s (see the route's maxDuration). Work is split
// so the cap can never lose anything:
//  - money (billing) runs FIRST and alone, so SMS volume can't starve it
//  - every church-looping task runs churches in parallel and stops STARTING new
//    churches at SMS_DEADLINE_MS, leaving headroom for ones already in flight
//  - every task is idempotent per church/record, so whatever was skipped is
//    simply picked up by the next hourly tick (nothing is ever sent twice)
const SMS_DEADLINE_MS = 36_000;
const BACKUP_DEADLINE_MS = 50_000;

/**
 * Runs every scheduled automation. `precise` = called by an hourly trigger that
 * should honour each church's exact send-hour; otherwise (the once-daily Vercel
 * cron, or a manual "run now") every timezone-gated task fires regardless of
 * hour via ignoreHour. Each task is isolated so one error can't stop the rest.
 */
export async function runDailyAutomations(now = new Date(), precise = false) {
  const t0 = Date.now();
  const smsDeadline = t0 + SMS_DEADLINE_MS;
  const ignoreHour = !precise;
  const summary: Record<string, unknown> = { precise };

  // 1) Money first (daily only). Cheap, and must never be crowded out.
  if (!precise) {
    summary.billing = await safe("billing", () => runBillingCycle());
  }

  // 2) Church-facing messages, each across churches in parallel.
  summary.birthdays = await safe("birthdays", () => runBirthdays(now, ignoreHour, smsDeadline));
  summary.rosterAnnouncements = await safe("rosterAnnouncements", () => runRosterAnnouncements(now, ignoreHour, smsDeadline));
  summary.rosterReminders = await safe("rosterReminders", () => runRosterReminders(now, ignoreHour, smsDeadline));
  summary.groupMeetings = await safe("groupMeetings", () => runGroupMeetingReminders(now, ignoreHour, smsDeadline));
  summary.followUpDigest = await safe("followUpDigest", () => runFollowUpDigest(now, ignoreHour, smsDeadline));

  // 3) Welcome / we-miss-you / thank-you / anniversary / visitor follow-up texts.
  // Every trigger is safe to repeat (per-person "already sent" flags, plus a
  // once-a-day guard on anniversaries). The hourly pass only texts between 8am
  // and 8pm church-local time; visitor follow-up keeps its own send hour.
  summary.automations = await safe("automations", () =>
    runAutomations(now, { deadline: smsDeadline, quietHours: precise }),
  );

  // 4) Daily-only housekeeping.
  if (!precise) {
    summary.fxRate = await safe("fx", () => refreshUsdToGhsRate());
    summary.pledgeReminders = await safe("pledgeReminders", () => runPledgeReminders(smsDeadline));
  }

  // 5) Backups use whatever time is left, then stop starting new churches.
  summary.backups = await safe("backups", () => runScheduledBackups(now, Math.max(0, t0 + BACKUP_DEADLINE_MS - Date.now())));

  summary.elapsedMs = Date.now() - t0;
  return summary;
}
