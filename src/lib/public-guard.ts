import "server-only";
import { rateLimitAll, rateLimit, clientIp, HOUR, DAY } from "@/lib/rate-limit";
import { normalisePhone } from "@/lib/phone";

/**
 * Limits for the public forms (join, visitor, prayer, testimony, counselling, booking, QR check-in).
 * Generous enough for a whole congregation registering on the church Wi-Fi after a service, but a
 * script hammering a form gets cut off before it can fill the church's records or spend its SMS credits.
 */
export async function allowPublicSubmission(kind: string, churchId: string): Promise<boolean> {
  const ip = await clientIp();
  return rateLimitAll([
    { key: `pub:${kind}:${churchId}:${ip}`, max: 60, windowMs: HOUR },
    { key: `pub-ip:${ip}`, max: 200, windowMs: DAY },
    { key: `pub-church:${kind}:${churchId}`, max: 1000, windowMs: DAY },
  ]);
}

/**
 * A name as it may appear inside an SMS the church pays for: letters, spaces, apostrophes and hyphens
 * only, at most 30 characters. Stops a "name" like "John, your account is locked, visit evil.link"
 * being texted out under the church's name.
 */
export function smsSafeName(name: string): string {
  const cleaned = String(name ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30);
  return cleaned || "friend";
}

/** True the first time a welcome text goes to this number for this church in 30 days, so a form can't be looped to text one number. */
export async function firstWelcomeTo(churchId: string, phone: string): Promise<boolean> {
  const key = normalisePhone(phone);
  if (!key) return false;
  return rateLimit(`welcome:${churchId}:${key}`, 1, 30 * DAY);
}

/** Caps the admin alert texts a church's public forms can trigger, so a flood of submissions can't drain its credits. */
export async function allowAdminAlertSms(churchId: string): Promise<boolean> {
  return rateLimitAll([
    { key: `admin-alert:${churchId}`, max: 20, windowMs: HOUR },
    { key: `admin-alert-d:${churchId}`, max: 100, windowMs: DAY },
  ]);
}
