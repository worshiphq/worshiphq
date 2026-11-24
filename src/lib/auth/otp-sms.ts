import "server-only";
import { db } from "@/lib/db";
import { sendSms, type SmsResult } from "@/lib/integrations/sms";
import { otherCarrier } from "@/lib/sms/routing";

/**
 * Texting a verification code, with the other carrier always behind it. Three nets, because "accepted" is not "arrived":
 *   1. the carrier refuses it or cannot be reached: the other one sends it at once (inside sendSms);
 *   2. the person asks for the code again: the new one goes by the other carrier, since the first may never have come;
 *   3. the carrier took it but the network then says it failed: the same code goes by the other carrier, while it is
 *      still waiting to be used.
 */
const RESEND_WINDOW_MS = 10 * 60_000;
/** When to ask whether it arrived. Kept short: this runs after the page has already answered. */
const CHECK_AFTER_MS = [4_000, 5_000];

/** The carrier that took the last code texted to this number, if that was only minutes ago. */
async function lastCarrier(phone: string): Promise<string | null> {
  try {
    const row = await db.platformSmsLog.findFirst({
      where: { createdAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) }, toNumbers: phone, body: { contains: "verification code" }, sent: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      select: { carrier: true },
    });
    return row?.carrier ?? null;
  } catch {
    return null;
  }
}

export async function textCode(phone: string, message: string, verificationId: string): Promise<SmsResult> {
  const previous = await lastCarrier(phone);
  const switchTo = previous ? otherCarrier(previous) : null;
  let sms: SmsResult | null = null;
  if (switchTo) {
    sms = await sendSms(phone, message, { heading: null, carrier: switchTo });
    if (!sms.ok) sms = null;
  }
  sms ??= await sendSms(phone, message, { heading: null });
  if (sms.ok && !sms.stubbed) await watchLater(phone, message, verificationId, sms);
  return sms;
}

async function watchLater(phone: string, message: string, verificationId: string, sms: SmsResult) {
  const first = sms.results[0];
  const next = otherCarrier(sms.provider);
  // Hubtel can be asked; Nalo only when the send asked it for a report.
  if (!first?.id || !next || !(sms.provider === "hubtel" || first.report)) return;
  const id = first.id;
  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        const { carrierStatus } = await import("@/lib/sms/delivery");
        for (const wait of CHECK_AFTER_MS) {
          await new Promise((r) => setTimeout(r, wait));
          const { state } = await carrierStatus(id);
          if (state === "delivered") return;
          if (state !== "failed") continue;
          // Used, replaced or expired codes are not sent again.
          const waiting = await db.phoneVerification.count({ where: { id: verificationId, expiresAt: { gt: new Date() } } });
          if (waiting) await sendSms(phone, message, { heading: null, carrier: next });
          return;
        }
      } catch (e) {
        console.error("[otp backup]", (e as Error).message);
      }
    });
  } catch {
    // Not inside a request: the code has gone, there is just nothing to watch it with.
  }
}
