import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runAutomations } from "@/lib/automations/run";
import { refreshUsdToGhsRate } from "@/lib/integrations/fx";
import { runPledgeReminders } from "@/lib/pledges/reminders";
import { runBillingCycle } from "@/lib/billing/renewals";
import { runBirthdays } from "@/lib/automations/birthdays";

export const dynamic = "force-dynamic";
// Allow longer execution for churches with many members.
export const maxDuration = 60;

/**
 * Daily automations cron. A scheduler hits this once a day and authenticates
 * with the CRON_SECRET (sent as `Authorization: Bearer <secret>`).
 * Sends birthday/anniversary/visitor/lapsed messages for every church.
 *
 * If no CRON_SECRET is configured (stub mode) we allow the call but only on
 * non-production so it can be exercised locally; production always requires it.
 */
export async function GET(request: NextRequest) {
  const authed = isAuthorized(request);
  if (!authed) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const now = new Date();
    // Birthday tasks run EVERY hour — each church self-gates to fire at its own
    // local send-hour (timezone-aware).
    const birthdays = await runBirthdays(now);

    // The once-a-day tasks only run on the 07:00 UTC invocation, so making the
    // cron hourly doesn't fire them 24×/day.
    if (now.getUTCHours() !== 7) {
      return Response.json({ ok: true, hourly: true, birthdays });
    }

    // Keep the USD→GHS rate fresh daily as a reliable backstop to the
    // on-demand refresh (persisted to PlatformConfig).
    const fxRate = await refreshUsdToGhsRate();
    const result = await runAutomations();
    // Pledge due-date reminders on each church's configured schedule.
    const pledgeReminders = await runPledgeReminders();
    // Apply scheduled downgrades, send renewal reminders, lapse unpaid plans.
    const billing = await runBillingCycle();
    return Response.json({ ok: true, fxRate, pledgeReminders, billing, birthdays, ...result });
  } catch (e) {
    console.error("[cron/automations] failed:", e);
    return new Response("Automation run failed", { status: 500 });
  }
}

function isAuthorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) {
    // No secret set: permit only outside production so local/dev can test it.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // A scheduler can also be configured to pass the secret as a query param.
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}
