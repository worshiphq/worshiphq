import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runAutomations } from "@/lib/automations/run";

export const dynamic = "force-dynamic";
// Allow longer execution for churches with many members.
export const maxDuration = 60;

/**
 * Daily automations cron. Vercel Cron hits this once a day (see vercel.json) and
 * authenticates with the CRON_SECRET (sent as `Authorization: Bearer <secret>`).
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
    const result = await runAutomations();
    return Response.json({ ok: true, ...result });
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
  // Vercel Cron can also be configured to pass the secret as a query param.
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}
