import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

export const rpName = env.NEXT_PUBLIC_APP_NAME;

export async function getRpConfig() {
  const h = await headers();
  const host = h.get("host") ?? new URL(env.NEXT_PUBLIC_APP_URL).hostname;
  const hostname = host.split(":")[0];
  const proto = h.get("x-forwarded-proto") ?? (hostname === "localhost" ? "http" : "https");
  const origin = `${proto}://${host}`;
  return { rpID: hostname, origin };
}
