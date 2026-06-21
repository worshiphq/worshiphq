import "server-only";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/integrations/sms";
import { features } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";

export { normalisePhone };

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

export interface SendOtpResult {
  ok: boolean;
  verificationId?: string;
  /** In stub mode (no SMS keys) we return the code so dev/testing can proceed. */
  devCode?: string;
  error?: string;
}

/**
 * Create a verification record, send the code by SMS, and return its id.
 * `payload` stashes pending signup details so the account is created only
 * after the code is confirmed. `userId` is used for the "login" purpose.
 */
export async function sendOtp(opts: {
  phone: string;
  purpose: "signup" | "login" | "reset-password" | "verify-phone" | "verify-email";
  payload?: Record<string, unknown>;
  userId?: string;
}): Promise<SendOtpResult> {
  const phone = normalisePhone(opts.phone);
  if (phone.length < 10) return { ok: false, error: "Enter a valid phone number." };

  const code = genCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

  // Clear any earlier pending codes for this phone+purpose.
  await db.phoneVerification.deleteMany({ where: { phone, purpose: opts.purpose } });

  const record = await db.phoneVerification.create({
    data: {
      phone,
      code,
      purpose: opts.purpose,
      payload: opts.payload ? (opts.payload as object) : undefined,
      userId: opts.userId,
      expiresAt,
    },
  });

  const sms = await sendSms(
    phone,
    `Your WorshipHQ verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`,
    { heading: null },
  );

  return {
    ok: sms.ok,
    verificationId: record.id,
    // Only expose the code when SMS is in stub mode (no real provider keys).
    devCode: features.sms ? undefined : code,
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
