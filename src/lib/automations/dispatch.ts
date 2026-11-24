import "server-only";
import { runWeeklyBriefing } from "@/lib/briefing/briefing";
import { runTrialNotices } from "@/lib/automations/trial-notices";
import { runAutomations } from "./run";
import { refreshUsdToGhsRate } from "@/lib/integrations/fx";
import { runPledgeReminders } from "@/lib/pledges/reminders";
import { runBillingCycle } from "@/lib/billing/renewals";
import { runBirthdays } from "./birthdays";
import { runRosterAnnouncements } from "./roster-announce";
import { runRosterReminders } from "./roster-reminders";
import { runGroupMeetingReminders } from "./group-meetings";
import { runCounselingReminders } from "./counseling-reminders";
import { runAbsenceCheck } from "./absence";
import { runAutoInactive } from "./auto-inactive";
import { runServiceThanks } from "@/lib/attendance/thanks";
import { runAgeGroupSync } from "@/lib/data/age";
import { runScheduledBackups } from "@/lib/backups/run";
import { runFollowUpDigest } from "@/lib/follow-ups/digest";
import { runAssetAlerts } from "@/lib/automations/asset-alerts";

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
 * Runs every scheduled automation. `precise` = the hourly trigger (no billing); otherwise the once-daily cron.
 * `sendNow` = SuperAdmin's manual "Run now": every timezone-gated task fires regardless of the hour.
 * Each task is isolated so one error can't stop the rest.
 */
/**
 * The run in parts, so the hourly ping can start each part as its own request with its own time limit. In one
 * request the slow early tasks used up the time and the later ones (thank-yous, "we miss you", follow-up digest,
 * backups) were never reached on daytime runs (Nov 2026). Leaving `only` out runs every part, as before.
 */
export const CRON_PARTS = ["messages", "messages2", "upkeep", "backups"] as const;
export type CronPart = (typeof CRON_PARTS)[number];

export async function runDailyAutomations(now = new Date(), precise = false, sendNow = false, only?: CronPart) {
  const t0 = Date.now();
  const want = (p: CronPart) => !only || only === p;
  const smsDeadline = t0 + SMS_DEADLINE_MS;
  // Each church's chosen send time is always respected. timeReached means "at or after", so the daily run only
  // catches up churches whose time has already passed today; the rest are sent by the hourly run at their hour.
  // (The daily 07:00 UTC run used to skip the check, sending a church set to 6pm its birthday texts at 7am.)
  // Only SuperAdmin's "Run now" sends everything regardless of the hour.
  const ignoreHour = sendNow;
  const summary: Record<string, unknown> = { precise, ...(only ? { part: only } : {}) };

  // 1) Money first (daily only). Cheap, and must never be crowded out.
  if (!precise && want("upkeep")) {
    summary.billing = await safe("billing", () => runBillingCycle());
  }

  if (want("messages")) {
  // Free-trial notices: a few rows, so it runs on every tick and a trial ending is announced within the half hour.
  summary.trialNotices = await safe("trialNotices", () => runTrialNotices(now));

  // 2) Church-facing messages, each across churches in parallel.
  summary.birthdays = await safe("birthdays", () => runBirthdays(now, ignoreHour, smsDeadline));
  // Early in the run: on the current host the hourly request is cut short, and from further down this list the
  // thank-you catch-up was never reached (Nov 2026: thank-yous left half sent for days).
  summary.serviceThanks = await safe("serviceThanks", () => runServiceThanks(now, ignoreHour, smsDeadline));
  summary.rosterAnnouncements = await safe("rosterAnnouncements", () => runRosterAnnouncements(now, ignoreHour, smsDeadline));
  summary.rosterReminders = await safe("rosterReminders", () => runRosterReminders(now, ignoreHour, smsDeadline));
  summary.groupMeetings = await safe("groupMeetings", () => runGroupMeetingReminders(now, ignoreHour, smsDeadline));
  }
  if (want("messages2")) {
  summary.counselingReminders = await safe("counselingReminders", () => runCounselingReminders(now, ignoreHour, smsDeadline));
  summary.absence = await safe("absence", () => runAbsenceCheck(now, ignoreHour, smsDeadline));
  summary.followUpDigest = await safe("followUpDigest", () => runFollowUpDigest(now, ignoreHour, smsDeadline));
  summary.assetAlerts = await safe("assetAlerts", () => runAssetAlerts(now, ignoreHour, smsDeadline));
  summary.weeklyBriefing = await safe("weeklyBriefing", () => runWeeklyBriefing(now, ignoreHour, smsDeadline));

  // 3) Welcome / we-miss-you / thank-you / anniversary / visitor follow-up texts.
  // Every trigger is safe to repeat (per-person "already sent" flags, plus a
  // once-a-day guard on anniversaries). The hourly pass only texts between 8am
  // and 8pm church-local time; visitor follow-up keeps its own send hour.
  summary.automations = await safe("automations", () =>
    runAutomations(now, { deadline: smsDeadline, quietHours: precise }),
  );
  }

  // 4) Daily-only housekeeping.
  if (!precise && want("upkeep")) {
    // A child turns into a teen on their birthday, not at some particular hour, so this swept every
    // church once an hour to do nothing 23 times out of 24.
    summary.ageGroups = await safe("ageGroups", () => runAgeGroupSync());
    // Max: members who have stopped coming move to inactive. Daily is plenty; it is a slow-moving fact about a person.
    summary.autoInactive = await safe("autoInactive", () => runAutoInactive(now, smsDeadline));
    summary.fxRate = await safe("fx", () => refreshUsdToGhsRate());
    summary.pledgeReminders = await safe("pledgeReminders", () => runPledgeReminders(smsDeadline));
    summary.levies = await safe("levies", async () => (await import("@/lib/levies/reminders")).runLevyReminders(now, smsDeadline));
    // Max (Staff & Payroll): SSNIT and PAYE due dates, emailed to payroll managers.
    summary.payrollReminders = await safe("payrollReminders", async () => (await import("@/lib/payroll/reminders")).runPayrollReminders(now, smsDeadline));
    // Churches whose Main Admin deleted them and whose recovery window has passed are deleted for good.
    summary.churchDeletions = await safe("churchDeletions", async () => (await import("@/lib/church-deletion")).purgeDeletedChurches(now));
  }

  // 4b) Delivery reports for texts sent in the last few days (Delivered / Not delivered on the SMS records).
  if (want("upkeep")) {
  summary.smsDelivery = await safe("smsDelivery", async () => {
    const { checkDeliveries } = await import("@/lib/sms/delivery");
    return checkDeliveries({ budgetMs: 15_000 });
  });

  // SuperAdmin outreach texts the network could not deliver: email them instead.
  summary.outreachDelivery = await safe("outreachDelivery", async () =>
    (await import("@/lib/outreach/delivery")).checkOutreachDeliveries({ budgetMs: 8_000 }),
  );

  summary.nalo = await safe("nalo", async () => (await import("@/lib/sms/nalo-reports")).watchNalo());

  // One email per run-out to churches whose texts are being held back for credits.
  summary.creditAlerts = await safe("creditAlerts", async () => (await import("@/lib/sms/credit-alerts")).runCreditAlerts(now));

  // 4c) The automatic email sequence (SuperAdmin, Email sequence). It gates itself: off unless switched on, mornings only.
  summary.emailSequence = await safe("emailSequence", async () =>
    (await import("@/lib/lifecycle/run")).runEmailSequence(now, { budgetMs: Math.max(0, Math.min(15_000, t0 + 46_000 - Date.now())) }),
  );

  }

  // 5) Backups use whatever time is left, then stop starting new churches.
  if (want("backups")) summary.backups = await safe("backups", () => runScheduledBackups(now, Math.max(0, t0 + BACKUP_DEADLINE_MS - Date.now())));

  summary.elapsedMs = Date.now() - t0;
  return summary;
}
