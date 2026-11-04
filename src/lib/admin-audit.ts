import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getSuperAdmin } from "@/lib/auth";

/** Never written to the log, whatever the action is called with. */
const SECRET = /pass|secret|token|otp|code|key|account|momo|pin|card|signature/i;
const MAX = 1500;

function tidy(v: unknown, depth = 0): unknown {
  if (v instanceof FormData) return tidy(Object.fromEntries(v.entries()), depth);
  if (v instanceof Date) return v.toISOString();
  if (typeof File !== "undefined" && v instanceof File) return `[file ${v.name}]`;
  if (typeof v === "string") return v.length > 200 ? `${v.slice(0, 200)}...` : v;
  if (v === null || typeof v !== "object") return v;
  if (depth >= 3) return "[...]";
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => tidy(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k.startsWith("$ACTION")) continue;
    out[k] = SECRET.test(k) ? "[hidden]" : tidy(val, depth + 1);
  }
  return out;
}

/**
 * Record that a SuperAdmin used an action, with what they entered. Runs straight after the permission check, so a
 * row means it was attempted by someone allowed to: the action itself can still fail on bad input. Never throws, and
 * never stops the action: an audit table problem must not block running the platform.
 */
export async function logAdminAction(action: string, args: Record<string, unknown> = {}): Promise<void> {
  try {
    const who = await getSuperAdmin();
    if (!who) return;
    const churchId = typeof args.churchId === "string" ? args.churchId : null;
    const church = churchId ? await db.church.findUnique({ where: { id: churchId }, select: { name: true } }) : null;
    const { churchId: _omit, ...rest } = args;
    void _omit;
    const detail = Object.keys(rest).length ? JSON.stringify(tidy(rest)).slice(0, MAX) : null;
    await db.adminAuditLog.create({
      data: { id: randomUUID(), actorEmail: who.email, actorName: who.name, action, churchId, churchName: church?.name ?? null, detail },
    });
  } catch (e) {
    console.error("[admin-audit] could not write:", (e as Error).message);
  }
}

/** Sign-in codes and reset links are live secrets, so a stored text never keeps them. */
export function redactSms(body: string): string {
  return body
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b\d{4,8}\b/g, "[code]")
    .slice(0, 500);
}

/**
 * What a text was for, from its own wording. These are all our own templates, so the wording is stable; anything
 * unrecognised is "Other" rather than guessed.
 */
export function classifySms(body: string): string {
  if (/received your gift/i.test(body)) return "Donor gift receipt";
  if (/new church on worshiphq/i.test(body)) return "Signup alert";
  if (/sender id/i.test(body)) return "Sender ID notice";
  if (/invited to join|main admin|budget leader/i.test(body)) return "Team invite";
  if (/upgraded|free upgrade|your plan|renew|payment/i.test(body)) return "Plan and billing notice";
  if (/password/i.test(body)) return "Password reset";
  if (/\bcode\b/i.test(body)) return "Sign-in or verification code";
  if (/\btest\b/i.test(body)) return "Test";
  return "Other";
}

/** Record one of WorshipHQ's own texts, one row per carrier it used. Churches' credit sends are in SmsAuditLog. Never throws. */
export async function logPlatformSms(row: { to: string[]; sent: number; carrier: string | null; sender?: string | null; body: string; error?: string | null; segments?: number; billedSegments?: number; costGhs?: number; churchId?: string | null }): Promise<void> {
  try {
    await db.platformSmsLog.create({
      data: {
        id: randomUUID(),
        toNumbers: row.to.slice(0, 20).join(", "),
        recipients: row.to.length,
        sent: row.sent,
        carrier: row.carrier,
        sender: row.sender ?? null,
        body: redactSms(row.body),
        error: row.error?.slice(0, 300) ?? null,
        purpose: classifySms(row.body),
        segments: row.segments ?? 1,
        billedSegments: row.billedSegments ?? 0,
        costGhs: row.costGhs ?? 0,
        churchId: row.churchId ?? null,
      },
    });
  } catch (e) {
    console.error("[platform-sms-log] could not write:", (e as Error).message);
  }
}
