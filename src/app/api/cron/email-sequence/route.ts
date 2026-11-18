import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/auth/tokens";
import { runEmailSequence } from "@/lib/lifecycle/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The email sequence's own daily run (vercel.json, 08:05 UTC), so it has a full minute to itself instead of what is
 * left over after the other automations. It still checks everything itself: off unless switched on, mornings only,
 * the daily cap, once per address per email.
 */
export async function GET(request: NextRequest) {
  const secret = env.CRON_SECRET;
  const ok = secret
    ? safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`) || safeEqual(new URL(request.url).searchParams.get("secret") ?? "", secret)
    : (request.headers.get("user-agent") ?? "").includes("vercel-cron") || process.env.NODE_ENV !== "production";
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const result = await runEmailSequence(new Date(), { budgetMs: 50_000 });
  console.info("[cron/email-sequence]", JSON.stringify(result));
  return Response.json({ ok: true, ...result });
}
