import crypto from "node:crypto";
import { authSecret, safeEqual } from "@/lib/auth/tokens";

/** What a Mobile Money charge was for. The same values as the sealed metadata `kind`. */
export type MomoKind = "plan_upgrade" | "sms_topup" | "online_gift";
const KINDS: readonly MomoKind[] = ["plan_upgrade", "sms_topup", "online_gift"];

export const MOMO_TOKEN_TTL_MS = 30 * 60_000;

export type MomoTokenPayload = { reference: string; churchId: string; kind: MomoKind; expiresAt: number };

function mac(reference: string, churchId: string, kind: string, expiresAt: number) {
  return crypto.createHmac("sha256", authSecret()).update(`momo|${reference}|${churchId}|${kind}|${expiresAt}`).digest("base64url");
}

/**
 * The pass the payment sheet holds while it waits for a Mobile Money charge: it lets the page (even a donor with no
 * account) check this one reference, and nothing else, for 30 minutes. It never grants anything by itself: only
 * Paystack saying the charge succeeded does.
 */
export function signMomoToken(p: { reference: string; churchId: string; kind: MomoKind }, now = Date.now(), ttlMs = MOMO_TOKEN_TTL_MS): string {
  const expiresAt = now + ttlMs;
  const body = Buffer.from(JSON.stringify({ r: p.reference, c: p.churchId, k: p.kind, e: expiresAt })).toString("base64url");
  return `${body}.${mac(p.reference, p.churchId, p.kind, expiresAt)}`;
}

/** The token's contents when it is genuine and unexpired; null otherwise. */
export function openMomoToken(token: string | null | undefined, now = Date.now()): MomoTokenPayload | null {
  if (!token || typeof token !== "string" || token.length > 600) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  let data: { r?: unknown; c?: unknown; k?: unknown; e?: unknown };
  try {
    data = JSON.parse(Buffer.from(token.slice(0, dot), "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const { r, c, k, e } = data ?? {};
  if (typeof r !== "string" || typeof c !== "string" || typeof k !== "string" || typeof e !== "number") return null;
  if (!KINDS.includes(k as MomoKind)) return null;
  if (!safeEqual(token.slice(dot + 1), mac(r, c, k, e))) return null;
  if (e < now) return null;
  return { reference: r, churchId: c, kind: k as MomoKind, expiresAt: e };
}
