"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { requireSuperAdmin, startGhostSession } from "@/lib/auth";
import { authSecret } from "@/lib/auth/tokens";
import { sendSms } from "@/lib/integrations/sms";
import { sendEmail } from "@/lib/integrations/email";
import { escapeHtml } from "@/lib/html";

/**
 * Consent-based support access. The platform owner asks to enter a church; a
 * one-time code goes by SMS to that church's Owner, and access only begins once
 * the Owner reads that code back. The code is stored hashed and is never shown
 * to the platform owner.
 */

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 4;
const CONSENT_SESSION_HOURS = 2;

const hashCode = (code: string, id: string) =>
  crypto.createHmac("sha256", authSecret()).update(`${id}:${code}`).digest("hex");

const maskPhone = (p: string) => (p.length <= 4 ? p : `•••• ${p.slice(-4)}`);
const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 1)}${"•".repeat(Math.max(1, u.length - 1))}@${d}` : e;
};

export type RequestAccessResult =
  | { ok: true; requestId: string; sentTo: string; expiresInMin: number; devCode?: string }
  | { ok: false; error: string };

/** Step 1: send the church Owner a one-time code. */
export async function requestSupportAccess(churchId: string, reason: string): Promise<RequestAccessResult> {
  await requireSuperAdmin();

  const church = await db.church.findUnique({ where: { id: churchId }, select: { id: true, name: true, isDemo: true } });
  if (!church) return { ok: false, error: "Church not found." };

  const recent = await db.supportAccess.count({
    where: { churchId, method: "consent", createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    return { ok: false, error: "Too many requests for this church in the last hour. Try again later." };
  }

  const owner = await db.user.findFirst({
    where: { churchId, role: "Owner" },
    orderBy: [{ phoneVerified: "desc" }, { createdAt: "asc" }],
    select: { phone: true, email: true },
  });
  if (!owner || (!owner.phone && !owner.email)) {
    return { ok: false, error: "This church's Owner has no phone or email on file to send a code to." };
  }

  // Only one live request per church at a time.
  await db.supportAccess.updateMany({
    where: { churchId, method: "consent", status: "pending" },
    data: { status: "cancelled" },
  });

  const code = String(crypto.randomInt(100000, 1000000));
  const rec = await db.supportAccess.create({
    data: {
      churchId,
      method: "consent",
      reason: reason.trim().slice(0, 300) || null,
      status: "pending",
      codeExpires: new Date(Date.now() + CODE_TTL_MIN * 60_000),
      sentTo: owner.phone ? maskPhone(owner.phone) : maskEmail(owner.email),
    },
  });
  await db.supportAccess.update({ where: { id: rec.id }, data: { codeHash: hashCode(code, rec.id) } });

  const body = `WorshipHQ Support is asking for temporary access to ${church.name} to help you. Code: ${code}. Only share it if you asked us for help. Expires in ${CODE_TTL_MIN} min.`;
  let delivered = false;
  let stubbed = false;
  if (owner.phone) {
    const sms = await sendSms(owner.phone, body, { heading: null });
    delivered = sms.ok;
    stubbed = !features.sms;
  } else {
    const mail = await sendEmail({
      to: owner.email,
      subject: "WorshipHQ Support access code",
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px"><p>${escapeHtml(body.split(" Code: ")[0])}.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:16px;text-align:center">${code}</div><p style="color:#888;font-size:13px">Only share this code if you asked us for help. It expires in ${CODE_TTL_MIN} minutes.</p></div>`,
    });
    delivered = mail.ok;
    stubbed = mail.stubbed;
  }

  if (!delivered && !stubbed) {
    await db.supportAccess.update({ where: { id: rec.id }, data: { status: "cancelled" } });
    return { ok: false, error: "The code could not be delivered. Try again in a moment." };
  }

  revalidatePath("/admin/access");
  return {
    ok: true,
    requestId: rec.id,
    sentTo: rec.sentTo ?? "",
    expiresInMin: CODE_TTL_MIN,
    // Only in stub mode (no SMS/email keys) so the flow can be exercised locally.
    devCode: stubbed ? code : undefined,
  };
}

export type RedeemResult = { ok: true } | { ok: false; error: string };

/** Step 2: enter the code the church read back. Starts a time-limited session. */
export async function redeemSupportAccess(requestId: string, code: string): Promise<RedeemResult> {
  await requireSuperAdmin();

  const rec = await db.supportAccess.findUnique({ where: { id: requestId } });
  if (!rec || rec.method !== "consent" || rec.status !== "pending" || !rec.codeHash) {
    return { ok: false, error: "This request is no longer open. Send a new code." };
  }
  if (!rec.codeExpires || rec.codeExpires < new Date()) {
    await db.supportAccess.update({ where: { id: rec.id }, data: { status: "expired" } });
    return { ok: false, error: "The code has expired. Send a new one." };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await db.supportAccess.update({ where: { id: rec.id }, data: { status: "cancelled" } });
    return { ok: false, error: "Too many wrong attempts. Send a new code." };
  }

  const given = Buffer.from(hashCode(code.trim(), rec.id));
  const want = Buffer.from(rec.codeHash);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    await db.supportAccess.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "That code is not right." };
  }

  const until = new Date(Date.now() + CONSENT_SESSION_HOURS * 60 * 60_000);
  await db.supportAccess.update({
    where: { id: rec.id },
    data: { status: "active", startedAt: new Date(), until, codeHash: null },
  });
  await startGhostSession(rec.churchId, { until: until.getTime(), rid: rec.id });
  revalidatePath("/admin/access");
  return { ok: true };
}

/** Cancel an unanswered request (e.g. wrong church, or the Owner can't be reached). */
export async function cancelSupportRequest(requestId: string) {
  await requireSuperAdmin();
  await db.supportAccess.updateMany({
    where: { id: requestId, status: "pending" },
    data: { status: "cancelled", codeHash: null },
  });
  revalidatePath("/admin/access");
}
