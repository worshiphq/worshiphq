import "server-only";
import { routingForChurch } from "@/lib/sms/routing";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/integrations/sms";
import { segmentsFor, smsNormalize } from "@/config/sms";
import { currentNameLine } from "@/lib/sms/message-name";

/** Recipients sent per provider call; credits are reserved per chunk. */
const SEND_CHUNK = 50;

export async function getSmsBalance(churchId: string): Promise<number> {
  const c = await db.church.findUnique({ where: { id: churchId }, select: { smsCredits: true } });
  return c?.smsCredits ?? 0;
}

/** Add (or remove, if negative) credits and log a ledger entry. Idempotent on `reference`. */
export async function addCredits(
  churchId: string,
  credits: number,
  kind: "topup" | "bonus" | "refund",
  opts?: {
    note?: string;
    reference?: string;
    amountGhs?: number;
    source?: "paystack" | "hubtel" | "granted" | "manual";
    /** The owner's own reason for an adjustment. Kept for the owner; the church never sees it. */
    adminNote?: string;
  },
): Promise<{ balance: number; created: boolean }> {
  // Idempotency: a Paystack reference is credited once. The ledger row is written first and the unique
  // (churchId, reference) index makes it the claim, so two deliveries at the same moment can't both credit.
  if (opts?.reference) {
    let claimId: string;
    try {
      const claim = await db.smsTransaction.create({
        data: {
          churchId, kind, credits, balanceAfter: 0,
          note: opts.note, reference: opts.reference,
          // Only named when there is one, so an ordinary send or top-up never touches this column.
          // Until sql/sms-audit-log.sql has run the column does not exist, and the one path that
          // sets it (the owner taking credits back) is the only one that can fail.
          ...(opts.adminNote ? { adminNote: opts.adminNote } : {}),
          amountGhs: opts.amountGhs ?? null,
          source: opts.source ?? (kind === "bonus" ? "granted" : null),
        },
        select: { id: true },
      });
      claimId = claim.id;
    } catch {
      return { balance: await getSmsBalance(churchId), created: false };
    }
    const after = await db.church.update({
      where: { id: churchId },
      data: { smsCredits: { increment: credits } },
      select: { smsCredits: true },
    });
    await db.smsTransaction.update({ where: { id: claimId }, data: { balanceAfter: after.smsCredits } });
    // A paid top-up (not a bonus/refund) is real money in: alert the platform owner, once, here on the claim.
    if (kind === "topup" && (opts.source === "paystack" || opts.source === "hubtel") && (opts.amountGhs ?? 0) > 0) {
      const { alertOwnerPayment } = await import("@/lib/billing/owner-alert");
      await alertOwnerPayment({ churchId, kind: "topup", what: `${credits.toLocaleString()} SMS credits`, amountGhs: opts.amountGhs!, provider: opts.source, reference: opts.reference });
    }
    return { balance: after.smsCredits, created: true };
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
      ...(opts?.adminNote ? { adminNote: opts.adminNote } : {}),
      amountGhs: opts?.amountGhs ?? null,
      source: opts?.source ?? (kind === "bonus" ? "granted" : null),
    },
  });
  return { balance: updated.smsCredits, created: true };
}

/** How many recipient outcomes we keep on an audit row. A 2,000-person broadcast doesn't need every
 *  number in the log to answer "did it go out?", and an unbounded JSON column would bloat the table. */
const AUDIT_NUMBER_CAP = 300;

/**
 * Record what went out. Never throws and never blocks a send: if the table has not been created yet,
 * or the write fails, the message has still been sent and billed, and losing the log entry must not
 * turn that into an error the church sees.
 */
async function logSmsSend(row: {
  churchId: string;
  label?: string;
  body: string;
  segments: number;
  recipients: number;
  sent: number;
  credits: number;
  senderName: string | null;
  results: { to: string; ok: boolean }[];
}) {
  try {
    // Who pressed send. A cron run, a public form or a webhook has no cookie, and getSession() throws
    // outside a request, so an unknown sender is the normal case rather than a failure.
    let sentById: string | null = null;
    let sentByName: string | null = null;
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (session && !session.isDemo && session.churchId === row.churchId) {
        sentById = session.userId;
        sentByName = session.name ?? null;
      }
    } catch {
      // no request context - leave it as an automatic send
    }

    await db.smsAuditLog.create({
      data: {
        churchId: row.churchId,
        label: row.label ?? null,
        body: row.body,
        segments: row.segments,
        recipients: row.recipients,
        sent: row.sent,
        credits: row.credits,
        senderName: row.senderName,
        sentById,
        sentByName,
        trigger: sentById ? "manual" : "automatic",
        numbers: JSON.stringify(row.results.slice(0, AUDIT_NUMBER_CAP)),
      },
    });
  } catch (e) {
    console.error("[sms audit]", (e as Error).message);
  }
}

export interface ChurchSmsResult {
  ok: boolean;
  sent: number;
  cost: number;
  balance: number;
  insufficient?: boolean;
  /** Per-recipient outcome, same order as the `to` list passed in, so the
   *  caller can log a detailed send audit (who got it, who didn't). */
  results?: { to: string; ok: boolean }[];
}

/**
 * Send a billable, church-branded SMS to one or more recipients, deducting
 * credits from the church's wallet. Use this for ALL church-facing SMS
 * (broadcasts, birthday wishes, welcome messages). Platform auth SMS (signup /
 * teammate OTP) should call sendSms directly - those are on the platform's dime.
 */
export async function sendChurchSms(
  churchId: string,
  to: string | string[],
  rawMessage: string,
  opts?: { note?: string },
): Promise<ChurchSmsResult> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const message = smsNormalize(rawMessage);

  // Brand the message with the church's name so members know who it's from
  // (the SMS sender ID is the platform's, e.g. "HostHub").
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: {
      name: true,
      smsSenderIdStatus: true,
      smsSenderId: true,
      smsPrefix: true,
      smsProvider: true,
      smsSenderIdProvider: true,
    },
  });

  // Its own sender name only counts on the carrier that approved it. Empty means Hubtel: everything approved
  // before carriers could be chosen was approved there.
  const carrier = routingForChurch(church?.smsProvider).primary;
  const senderCarrier = church?.smsSenderIdProvider ?? "hubtel";
  const senderApproved = church?.smsSenderIdStatus === "approved";
  const ownSender = senderApproved && senderCarrier === carrier;

  // The church name line, used to brand any message that goes out under a platform sender (e.g. Nalo for
  // international numbers, where the church's own Hubtel-approved sender does not apply).
  const nameLine = currentNameLine(church?.smsPrefix, church?.name ?? "WorshipHQ");
  // With its own approved sender name the church needs no name line on the primary (Hubtel) carrier.
  // Otherwise the line is the name it chose (full or short), or its full name until it chooses.
  const heading = ownSender ? null : nameLine;
  const smsText = heading ? `${heading}\n${message}` : message;

  const segments = segmentsFor(smsText);
  // Worst-case cost, used to gate whether we attempt the send at all.
  const estimatedCost = segments * recipients.length;

  const balance = await getSmsBalance(churchId);
  if (recipients.length === 0) return { ok: true, sent: 0, cost: 0, balance };
  if (balance < estimatedCost) {
    // Worth a row of its own: "the birthday texts never went out because the wallet was empty" is the
    // single most useful thing the log can tell a church weeks later.
    await logSmsSend({
      churchId, label: opts?.note, body: message, segments,
      recipients: recipients.length, sent: 0, credits: 0,
      senderName: ownSender ? church?.smsSenderId : nameLine,
      results: recipients.map((r) => ({ to: r, ok: false })),
    });
    return { ok: false, sent: 0, cost: estimatedCost, balance, insufficient: true };
  }

  // Credits are taken BEFORE each chunk is sent (only if the balance still covers it), and the unsent
  // part is handed back after. So sends running at the same time can never overspend the wallet, and a
  // send cut off half way has already paid for what went out.
  const senderId = senderApproved ? church?.smsSenderId ?? null : null;
  const results: { to: string; ok: boolean }[] = [];
  let sent = 0;
  let cost = 0;
  let ledgerId: string | null = null;
  let balanceAfter = balance;
  let ranOut = false;
  for (let i = 0; i < recipients.length; i += SEND_CHUNK) {
    const chunk = recipients.slice(i, i + SEND_CHUNK);
    const reserve = segments * chunk.length;
    const claimed = await db.church.updateMany({
      where: { id: churchId, smsCredits: { gte: reserve } },
      data: { smsCredits: { decrement: reserve } },
    });
    if (claimed.count === 0) {
      ranOut = true;
      for (const r of chunk) results.push({ to: r, ok: false });
      for (const r of recipients.slice(i + SEND_CHUNK)) results.push({ to: r, ok: false });
      break;
    }
    let chunkSent = 0;
    try {
      const res = await sendSms(chunk, message, { heading, senderId, platformHeading: nameLine, carrier: church?.smsProvider ?? null, senderCarrier });
      chunkSent = res.sentCount;
      results.push(...(res.results ?? chunk.map((r) => ({ to: r, ok: res.sentCount > 0 }))));
    } finally {
      const unused = reserve - segments * chunkSent;
      const after = await db.church.update({
        where: { id: churchId },
        data: unused > 0 ? { smsCredits: { increment: unused } } : {},
        select: { smsCredits: true },
      });
      balanceAfter = after.smsCredits;
    }
    sent += chunkSent;
    cost += segments * chunkSent;
    if (chunkSent > 0) {
      // One ledger row per send, kept up to date chunk by chunk.
      const note =
        i + SEND_CHUNK < recipients.length || sent < recipients.length
          ? `${opts?.note ?? "Broadcast"} (${sent}/${recipients.length} delivered)`
          : opts?.note ?? `${recipients.length} recipient(s)`;
      if (ledgerId) {
        await db.smsTransaction.update({ where: { id: ledgerId }, data: { credits: -cost, balanceAfter, note } });
      } else {
        const row = await db.smsTransaction.create({
          data: { churchId, kind: "usage", credits: -cost, balanceAfter, note },
          select: { id: true },
        });
        ledgerId = row.id;
      }
    }
  }

  // Logged whether or not anything went out: "we tried and nothing was delivered" is exactly the
  // question a church asks later, so a failed send is worth a row too.
  await logSmsSend({
    churchId,
    label: opts?.note,
    body: message,
    segments,
    recipients: recipients.length,
    sent,
    credits: cost,
    senderName: ownSender ? senderId ?? nameLine : nameLine,
    results,
  });

  if (sent === 0) {
    return { ok: false, sent: 0, cost: estimatedCost, balance: balanceAfter, insufficient: ranOut || undefined, results };
  }
  return { ok: true, sent, cost, balance: balanceAfter, results };
}
