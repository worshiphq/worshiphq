import "server-only";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/integrations/sms";
import { sendEmail } from "@/lib/integrations/email";
import { features } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";

export { normalisePhone };

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export type OtpChannel = "sms" | "email";
export type OtpPurpose = "signup" | "login" | "reset-password" | "verify-phone" | "verify-email";

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function isEmail(v: string): boolean {
  return /^\S+@\S+\.\S+$/.test(v.trim());
}

/** The verification-code email body. */
function otpEmailHtml(code: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px;font-size:20px">Your WorshipHQ verification code</h2>
      <p style="margin:0 0 16px;color:#555">Use this code to continue. It expires in ${CODE_TTL_MIN} minutes.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:16px;text-align:center">${code}</div>
      <p style="margin:16px 0 0;color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;
}

export interface SendOtpResult {
  ok: boolean;
  verificationId?: string;
  channel?: OtpChannel;
  /** Where the code was sent, masked for display (e.g. "j•••@gmail.com" / "•••• 4821"). */
  sentToMasked?: string;
  /** In stub mode (no provider keys) we return the code so dev/testing can proceed. */
  devCode?: string;
  error?: string;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(1, user.length - 1))}@${domain}`;
}
function maskPhone(phone: string): string {
  return phone.length <= 4 ? phone : `•••• ${phone.slice(-4)}`;
}

/**
 * Create a verification record and send the code by SMS **or email** depending
 * on `channel` (defaults to SMS for backward compatibility). `payload` stashes
 * pending signup details so the account is created only after the code is
 * confirmed. `userId` ties the code to a user (login / verify purposes).
 */
export async function sendOtp(opts: {
  purpose: OtpPurpose;
  channel?: OtpChannel;
  phone?: string;
  email?: string;
  payload?: Record<string, unknown>;
  userId?: string;
}): Promise<SendOtpResult> {
  // Explicit channel wins; otherwise infer from what was supplied (an email
  // address → email, a phone number → SMS). Existing SMS callers pass `phone`.
  const channel: OtpChannel = opts.channel ?? (opts.email ? "email" : "sms");

  // Resolve + validate the destination for the chosen channel.
  let destination: string;
  if (channel === "email") {
    destination = (opts.email ?? "").toLowerCase().trim();
    if (!isEmail(destination)) return { ok: false, error: "Enter a valid email address." };
  } else {
    destination = normalisePhone(opts.phone ?? "");
    if (destination.length < 10) return { ok: false, error: "Enter a valid phone number." };
  }

  const code = genCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

  // Clear any earlier pending codes for this destination+purpose.
  await db.phoneVerification.deleteMany({ where: { phone: destination, purpose: opts.purpose } });

  const record = await db.phoneVerification.create({
    data: {
      phone: destination,
      channel,
      code,
      purpose: opts.purpose,
      payload: opts.payload ? (opts.payload as object) : undefined,
      userId: opts.userId,
      expiresAt,
    },
  });

  let ok = false;
  let stubbed = false;
  if (channel === "email") {
    const res = await sendEmail({
      to: destination,
      subject: `Your WorshipHQ code is ${code}`,
      html: otpEmailHtml(code),
    });
    ok = res.ok;
    stubbed = res.stubbed;
  } else {
    const sms = await sendSms(
      destination,
      `Your WorshipHQ verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`,
      { heading: null },
    );
    ok = sms.ok;
    stubbed = !features.sms;
  }

  return {
    ok,
    verificationId: record.id,
    channel,
    sentToMasked: channel === "email" ? maskEmail(destination) : maskPhone(destination),
    // Only expose the code when the provider is in stub mode (no real keys).
    devCode: stubbed ? code : undefined,
  };
}

export interface VerifyOtpResult {
  ok: boolean;
  error?: string;
  payload?: Record<string, unknown> | null;
  phone?: string;
  userId?: string | null;
}

/** Check a submitted code against a verification record. Consumes it on success. */
export async function verifyOtp(verificationId: string, code: string): Promise<VerifyOtpResult> {
  const record = await db.phoneVerification.findUnique({ where: { id: verificationId } });
  if (!record) return { ok: false, error: "This verification has expired. Please request a new code." };

  if (record.expiresAt < new Date()) {
    await db.phoneVerification.delete({ where: { id: record.id } });
    return { ok: false, error: "The code has expired. Please request a new one." };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await db.phoneVerification.delete({ where: { id: record.id } });
    return { ok: false, error: "Too many attempts. Please request a new code." };
  }
  if (record.code !== code.trim()) {
    await db.phoneVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Incorrect code. Please try again." };
  }

  // Success — consume the record.
  await db.phoneVerification.delete({ where: { id: record.id } });
  return {
    ok: true,
    payload: (record.payload as Record<string, unknown> | null) ?? null,
    phone: record.phone,
    userId: record.userId,
  };
}
