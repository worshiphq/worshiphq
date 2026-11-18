import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runDailyAutomations, CRON_PARTS, type CronPart } from "@/lib/automations/dispatch";
import { brand } from "@/config/brand";
import { purgeExpiredBinItems } from "@/lib/recycle-bin";
import { expireStalePaymentIntents } from "@/lib/billing/collection-provider";
import { checkFxStaleness } from "@/lib/integrations/fx";
import { alertOwnerStaleFx } from "@/lib/billing/owner-alert";
import { safeEqual } from "@/lib/auth/tokens";
import { retryFailedEmails } from "@/lib/integrations/email";
import { db } from "@/lib/db";

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

  const url = new URL(request.url);
  const precise = url.searchParams.get("precise") === "1";
  const partParam = url.searchParams.get("part");
  const part = CRON_PARTS.find((p) => p === partParam) as CronPart | undefined;

  // On Netlify, start each part as its own request so each gets its own time limit (one request ran out of time
  // part way down the list on daytime runs and the later tasks never ran). Each part is safe to repeat.
  const onNetlify = !!process.env.NETLIFY || url.hostname.endsWith(".netlify.app");
  if (!part && onNetlify && env.CRON_SECRET) {
    const started = await Promise.all(CRON_PARTS.map(async (p) => {
      const sub = `${brand.url}/api/cron/automations?part=${p}${precise ? "&precise=1" : ""}`;
      try {
        await fetch(sub, { headers: { authorization: `Bearer ${env.CRON_SECRET}` }, signal: AbortSignal.timeout(3_000), cache: "no-store" });
        return [p, "done"] as const;
      } catch {
        // Timing out here is expected: the part carries on running after this request stops waiting for it.
        return [p, "started"] as const;
      }
    }));
    return Response.json({ ok: true, precise, parts: Object.fromEntries(started) });
  }

  const summary = await runDailyAutomations(new Date(), precise, false, part);
  // Everything below belongs to the "upkeep" part (or to an unsplit run).
  if (part && part !== "upkeep") {
    console.info(`[cron/automations] ran ${part}`, JSON.stringify(summary));
    return Response.json({ ok: true, ...summary });
  }
  // Housekeeping runs on the once-daily batch only. Both sweep every church, and neither is
  // time-sensitive to the hour: a 7-day-old deleted row does not care whether it goes at 02:00 or
  // 14:00. Doing them on all 24 hourly pings instead was 24x the work for no benefit, which is a
  // large share of what the hourly pinger was costing in compute.
  let recycleBin: Awaited<ReturnType<typeof purgeExpiredBinItems>> | { error: string } | null = null;
  let expiredIntents: number | null = null;
  if (!precise) {
    recycleBin = await purgeExpiredBinItems().catch((err) => ({ error: String(err) }));
    expiredIntents = await expireStalePaymentIntents().catch(() => 0);
  }
  // The live FX feed should refresh every 6h. Only checked (and alerted) from the once-daily batch - not the
  // hourly precise pinger - so a dead feed can trigger at most one owner email per day, not one per hour.
  let fx: { stale: boolean; hoursSince: number | null } | null = null;
  if (!precise) {
    try {
      fx = await checkFxStaleness();
      if (fx.stale) await alertOwnerStaleFx(fx.hoursSince);
    } catch {
      /* never let an FX check break the rest of the cron */
    }
  }
  // Emails that failed (every sender full or down) go again every hour, for up to 3 days and 4 tries.
  const emailRetry = await retryFailedEmails({ budgetMs: 15_000, limit: 60 }).catch(() => null);
  // The email log keeps 90 days.
  if (!precise) await db.emailLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } }).catch(() => {});
  console.info("[cron/automations] ran", JSON.stringify(summary));
  return Response.json({ ok: true, ...summary, recycleBin, expiredIntents, fx, emailRetry });
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
