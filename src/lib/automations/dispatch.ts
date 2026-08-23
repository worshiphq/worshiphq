import "server-only";
import { runAutomations } from "./run";
import { refreshUsdToGhsRate } from "@/lib/integrations/fx";
import { runPledgeReminders } from "@/lib/pledges/reminders";
import { runBillingCycle } from "@/lib/billing/renewals";
import { runBirthdays } from "./birthdays";
import { runRosterAnnouncements } from "./roster-announce";
import { runRosterReminders } from "./roster-reminders";
import { runGroupMeetingReminders } from "./group-meetings";

/** Run one task, but never let its failure abort the whole batch. */
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[automations] ${label} failed:`, e);
    return { error: (e as Error)?.message ?? "failed" };
  }
}

/**
 * Runs every scheduled automation. `precise` = called by an hourly trigger that
 * should honour each church's exact send-hour; otherwise (the once-daily Vercel
 * cron, or a manual "run now") every timezone-gated task fires regardless of
 * hour via ignoreHour. Each task is isolated so one error can't stop the rest.
 */
export async function runDailyAutomations(now = new Date(), precise = false) {
  const ignoreHour = !precise;
  const summary: Record<string, unknown> = { precise };

  summary.birthdays = await safe("birthdays", () => runBirthdays(now, ignoreHour));
  summary.rosterAnnouncements = await safe("rosterAnnouncements", () => runRosterAnnouncements(now, ignoreHour));
  summary.rosterReminders = await safe("rosterReminders", () => runRosterReminders(now, ignoreHour));
  summary.groupMeetings = await safe("groupMeetings", () => runGroupMeetingReminders(now, ignoreHour));

  if (precise) return summary;

  summary.fxRate = await safe("fx", () => refreshUsdToGhsRate());
  summary.pledgeReminders = await safe("pledgeReminders", () => runPledgeReminders());
  summary.billing = await safe("billing", () => runBillingCycle());
  summary.other = await safe("runAutomations", () => runAutomations());
  return summary;
}
