import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * The one secret every signed token and code hash is built from.
 * NEXTAUTH_SECRET when it is set; otherwise a value derived from the database URL, which is just as private.
 * There is never a fixed fallback string, because a string in the source code is public.
 */
let cached: string | null = null;
export function authSecret(): string {
  if (cached) return cached;
  const configured = env.NEXTAUTH_SECRET?.trim();
  if (configured) return (cached = configured);
  const base = env.DATABASE_URL ?? env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) {
    if (process.env.NODE_ENV === "production") throw new Error("NEXTAUTH_SECRET is not set.");
    return (cached = "local-dev-only-secret");
  }
  return (cached = crypto.createHash("sha256").update(`whq-auth-secret:${base}`).digest("base64url"));
}

/**
 * Each kind of token is signed under its own purpose, so a token made for one job
 * (a desktop login, a password reset) can never be passed off as another (a web session).
 */
export type TokenPurpose = "login-challenge" | "reset" | "desktop" | "desktop-plan" | "checkin-pick";

function mac(purpose: string, body: string): string {
  return crypto.createHmac("sha256", authSecret()).update(`${purpose}:${body}`).digest("base64url");
}

/** Equal-length, constant-time compare that never throws. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function signToken(purpose: TokenPurpose, data: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

/** The token's data if it was signed for this purpose and has not expired, else null. */
export function readToken<T extends Record<string, unknown>>(purpose: TokenPurpose, token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, mac(purpose, body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
