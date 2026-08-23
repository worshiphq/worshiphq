import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runDailyAutomations } from "@/lib/automations/dispatch";

export const dynamic = "force-dynamic";
// Allow longer execution for churches with many members.
export const maxDuration = 60;

/**
 * Automations cron. Vercel's daily cron hits this once a day; an optional hourly
 * pinger can hit it with ?precise=1 to honour each church's exact send-hour.
 *
 * Auth: a genuine Vercel cron invocation (user-agent "vercel-cron/1.0") is
 * always trusted so scheduled runs work even if CRON_SECRET was never wired into
 * the project. Any other caller must present the CRON_SECRET (bearer or ?secret).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const precise = new URL(request.url).searchParams.get("precise") === "1";
  const summary = await runDailyAutomations(new Date(), precise);
  console.info("[cron/automations] ran", JSON.stringify(summary));
  return Response.json({ ok: true, ...summary });
}

function isAuthorized(request: NextRequest): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  const isVercelCron = ua.includes("vercel-cron");
  const secret = env.CRON_SECRET;

  if (secret) {
    if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
    if (new URL(request.url).searchParams.get("secret") === secret) return true;
    // Trust real Vercel cron calls even if the bearer wasn't injected.
    return isVercelCron;
  }
  // No secret configured: allow Vercel cron and any non-production caller.
  return isVercelCron || process.env.NODE_ENV !== "production";
}
