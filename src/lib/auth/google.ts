import "server-only";
import crypto from "node:crypto";
import { env, features } from "@/lib/env";
import { brand } from "@/config/brand";
import { signToken, readToken } from "@/lib/auth/tokens";

/**
 * Sign in with Google (OpenID Connect, authorization-code flow with PKCE). No library: two HTTPS calls to Google.
 * Google proves the person owns the email address, so a Google sign-in skips WorshipHQ's own 6-digit code.
 * The button only shows once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */

export const GOOGLE_STATE_COOKIE = "whq_google_state";
export const GOOGLE_SIGNUP_COOKIE = "whq_google_signup";
const STATE_TTL = 10 * 60_000;
export const SIGNUP_TTL = 30 * 60_000;

export const googleEnabled = () => features.googleAuth;

/**
 * The public address of the site. In production always the real domain: the host's own request URL can be an
 * internal one (Netlify passes its deploy address), which would send people to the wrong site without their session.
 */
export function siteOrigin(requestOrigin: string): string {
  return process.env.NODE_ENV === "production" ? brand.url : requestOrigin;
}

/** Where Google sends people back to. Must match the address registered with Google exactly. */
export function googleRedirectUri(requestOrigin: string): string {
  return `${siteOrigin(requestOrigin)}/api/auth/google/callback`;
}

const clientId = () => (env.GOOGLE_CLIENT_ID ?? "").trim();
const clientSecret = () => (env.GOOGLE_CLIENT_SECRET ?? "").trim();

export type GoogleMode = "signin" | "signup";
type StateData = { state: string; nonce: string; verifier: string; mode: GoogleMode; plan?: string };

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Builds Google's consent URL and the signed cookie that proves the reply belongs to this browser. */
export function startGoogle(redirectUri: string, mode: GoogleMode, plan?: string): { url: string; cookie: string } {
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const data: StateData = { state, nonce, verifier, mode, ...(plan ? { plan } : {}) };
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, cookie: signToken("google-oauth", data, STATE_TTL) };
}

export function readGoogleState(cookie: string | undefined): StateData | null {
  return readToken<StateData>("google-oauth", cookie);
}

export type GoogleIdentity = { email: string; name: string; sub: string };

/**
 * Swaps the one-time code for the person's identity. The ID token comes straight from Google's token endpoint
 * over HTTPS in answer to our secret, so (as OpenID Connect allows) its claims are checked rather than its signature.
 */
/** Why a Google sign-in failed: a short code safe to show and log (never a secret). */
export type GoogleFailure = { error: "unverified" | "failed"; reason: string };

export async function finishGoogle(code: string, redirectUri: string, verifier: string, nonce: string): Promise<GoogleIdentity | GoogleFailure> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      // Google answers with a short code such as invalid_client (wrong ID or secret) or redirect_uri_mismatch.
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      const reason = `token-${String(err.error ?? res.status).replace(/[^a-z0-9_]/gi, "").slice(0, 40)}`;
      console.error("[google sign-in]", reason);
      return { error: "failed", reason };
    }
    const json = (await res.json()) as { id_token?: string };
    const payload = json.id_token?.split(".")[1];
    if (!payload) return { error: "failed", reason: "no-id-token" };
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      iss?: string; aud?: string; exp?: number; nonce?: string; sub?: string;
      email?: string; email_verified?: boolean | string; name?: string; given_name?: string;
    };
    const issOk = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
    const bad = !issOk ? "iss" : c.aud !== clientId() ? "aud" : !c.exp || c.exp * 1000 < Date.now() ? "exp" : c.nonce !== nonce ? "nonce" : !c.sub || !c.email ? "claims" : null;
    if (bad || !c.sub || !c.email) {
      console.error("[google sign-in] claim", bad);
      return { error: "failed", reason: `claim-${bad ?? "claims"}` };
    }
    if (!(c.email_verified === true || c.email_verified === "true")) return { error: "unverified", reason: "unverified" };
    return { email: c.email.toLowerCase().trim(), name: (c.name || c.given_name || "").trim().slice(0, 80), sub: c.sub };
  } catch (e) {
    console.error("[google sign-in] exception", (e as Error).message);
    return { error: "failed", reason: "exception" };
  }
}

/** The Google identity waiting for its church details, carried between the callback and the sign-up form. */
export type PendingGoogleSignup = { email: string; name: string; sub: string };
export const signPendingSignup = (g: GoogleIdentity) => signToken("google-signup", { email: g.email, name: g.name, sub: g.sub }, SIGNUP_TTL);
export const readPendingSignup = (cookie: string | undefined) => readToken<PendingGoogleSignup>("google-signup", cookie);
