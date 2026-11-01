import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runDailyAutomations } from "@/lib/automations/dispatch";
import { purgeExpiredBinItems } from "@/lib/recycle-bin";
import { expireStalePaymentIntents } from "@/lib/billing/collection-provider";
import { safeEqual } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";
// Allow longer execution for churches with many members.
export const maxDuration = 60;

/**
 * Automations cron. Vercel's daily cron hits this once a day; an optional hourly
 * pinger can hit it with ?precise=1 to honour each church's exact send-hour.
 *
 * Auth: once CRON_SECRET is set, every caller must present it: Vercel's own cron sends it as
 * "Authorization: Bearer <secret>" by itself, and the Supabase pinger sends ?secret=. A user-agent
 * proves nothing (anyone can send "vercel-cron"), so it is only trusted while no secret is set.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const precise = new URL(request.url).searchParams.get("precise") === "1";
  const summary = await runDailyAutomations(new Date(), precise);
  // Recycle bin: anything deleted more than 7 days ago is removed for good.
  const recycleBin = await purgeExpiredBinItems().catch((err) => ({ error: String(err) }));
  // Tidy up abandoned checkout intents so "pending" rows don't pile up forever.
  const expiredIntents = await expireStalePaymentIntents().catch(() => 0);
  console.info("[cron/automations] ran", JSON.stringify(summary));
  return Response.json({ ok: true, ...summary, recycleBin, expiredIntents });
}

function isAuthorized(request: NextRequest): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  const isVercelCron = ua.includes("vercel-cron");
  const secret = env.CRON_SECRET;

  if (secret) {
    if (safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return true;
    return safeEqual(new URL(request.url).searchParams.get("secret") ?? "", secret);
  }
  // No secret configured: allow Vercel cron and any non-production caller.
  if (isVercelCron && process.env.NODE_ENV === "production") {
    console.warn("[cron/automations] CRON_SECRET is not set; trusting the user-agent. Set CRON_SECRET in Vercel.");
  }
  return isVercelCron || process.env.NODE_ENV !== "production";
}
