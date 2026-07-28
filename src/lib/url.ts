import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Absolute base URL for building share links / QR codes from a server context.
 *
 * Prefers the real request host (so a link always matches the domain the church
 * is actually using — never a hosting-provider *.vercel.app URL), and only
 * falls back to the configured NEXT_PUBLIC_APP_URL when headers aren't available.
 * A *.vercel.app host is ignored in favour of the canonical domain.
 */
export async function getBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host && !host.includes("vercel.app")) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    /* headers() unavailable (e.g. static context) — fall through */
  }
  const configured = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured && !configured.includes("vercel.app")) return configured;
  return "https://worshiphq.app";
}
