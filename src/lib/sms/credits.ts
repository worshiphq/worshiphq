import "server-only";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/integrations/sms";
import { segmentsFor } from "@/config/sms";

export async function getSmsBalance(churchId: string): Promise<number> {
  const c = await db.church.findUnique({ where: { id: churchId }, select: { smsCredits: true } });
  return c?.smsCredits ?? 0;
}

/** Add (or remove, if negative) credits and log a ledger entry. Idempotent on `reference`. */
export async function addCredits(
  churchId: string,
  credits: number,
  kind: "topup" | "bonus" | "refund",
  opts?: { note?: string; reference?: string },
): Promise<{ balance: number; created: boolean }> {
  // Idempotency: don't double-credit a Paystack reference on webhook retries.
  if (opts?.reference) {
    const existing = await db.smsTransaction.findFirst({
      where: { churchId, reference: opts.reference },
      select: { id: true },
    });
    if (existing) {
      const bal = await getSmsBalance(churchId);
      return { balance: bal, created: false };
    }
  }

  const updated = await db.church.update({
    where: { id: churchId },
    data: { smsCredits: { increment: credits } },
    select: { smsCredits: true },
  });
  await db.smsTransaction.create({
    data: {
      churchId,
      kind,
      credits,
      balanceAfter: updated.smsCredits,
      note: opts?.note,
      reference: opts?.reference,
    },
  });
  return { balance: updated.smsCredits, created: true };
}

export interface ChurchSmsResult {
  ok: boolean;
  sent: number;
  cost: number;
  balance: number;
  insufficient?: boolean;
}

/**
 * Send a billable, church-branded SMS to one or more recipients, deducting
 * credits from the church's wallet. Use this for ALL church-facing SMS
 * (broadcasts, birthday wishes, welcome messages). Platform auth SMS (signup /
 * teammate OTP) should call sendSms directly — those are on the platform's dime.
 */
export async function sendChurchSms(
  churchId: string,
  to: string | string[],
  message: string,
  opts?: { note?: string },
): Promise<ChurchSmsResult> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  // Brand the message with the church's name so members know who it's from
  // (the SMS sender ID is the platform's, e.g. "HostHub").
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  const heading = church?.name ?? "WorshipHQ";
  const cost = segmentsFor(`${heading}\n${message}`) * recipients.length;

  const balance = await getSmsBalance(churchId);
  if (recipients.length === 0) return { ok: true, sent: 0, cost: 0, balance };
  if (balance < cost) {
    return { ok: false, sent: 0, cost, balance, insufficient: true };
  }

  const res = await sendSms(recipients, message, { heading });
  if (!res.ok) return { ok: false, sent: 0, cost, balance };

  const updated = await db.church.update({
    where: { id: churchId },
    data: { smsCredits: { decrement: cost } },
    select: { smsCredits: true },
  });
  await db.smsTransaction.create({
    data: {
      churchId,
      kind: "usage",
      credits: -cost,
      balanceAfter: updated.smsCredits,
      note: opts?.note ?? `${recipients.length} recipient(s)`,
    },
  });

  return { ok: true, sent: recipients.length, cost, balance: updated.smsCredits };
}
